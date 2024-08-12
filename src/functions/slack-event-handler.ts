import { APIGatewayProxyResult, Callback, Context } from 'aws-lambda';
import { ERROR_MSG, getMarkdownBlock, validateSlackRequest } from '@helpers/slack/slack-helpers';
import { getSessionCreds, SessionManagerEnv, startSession } from '@helpers/idc/session-helpers';
import {
  chatDependencies,
  getChannelKey,
  getChannelMetadata,
  saveChannelMetadata,
  saveMessageMetadata
} from '@helpers/chat';
import { getOrThrowIfEmpty, isEmpty } from '@src/utils';
import { makeLogger } from '@src/logging';
import { chat, getSignInBlocks, getFeedbackBlocks, getResponseAsBlocks } from '@helpers/amazon-q/amazon-q-helpers';
import { UsersInfoResponse } from '@slack/web-api';
import { FileElement } from '@slack/web-api/dist/response/ConversationsRepliesResponse';
import { AttachmentInput, ChatOutputStream } from '@aws-sdk/client-qbusiness';
import { Credentials } from 'aws-sdk';
import { FailedAttachmentEvent, MetadataEvent, TextOutputEvent } from '@aws-sdk/client-qbusiness';

const logger = makeLogger('slack-event-handler');

const processSlackEventsEnv = (env: NodeJS.ProcessEnv) => ({
  REGION: getOrThrowIfEmpty(env.AWS_REGION ?? env.AWS_DEFAULT_REGION),
  SLACK_SECRET_NAME: getOrThrowIfEmpty(env.SLACK_SECRET_NAME),
  AMAZON_Q_APP_ID: getOrThrowIfEmpty(env.AMAZON_Q_APP_ID),
  AMAZON_Q_REGION: getOrThrowIfEmpty(env.AMAZON_Q_REGION),
  CONTEXT_DAYS_TO_LIVE: getOrThrowIfEmpty(env.CONTEXT_DAYS_TO_LIVE),
  CACHE_TABLE_NAME: getOrThrowIfEmpty(env.CACHE_TABLE_NAME),
  MESSAGE_METADATA_TABLE_NAME: getOrThrowIfEmpty(env.MESSAGE_METADATA_TABLE_NAME),
  OIDC_STATE_TABLE_NAME: getOrThrowIfEmpty(env.OIDC_STATE_TABLE_NAME),
  IAM_SESSION_TABLE_NAME: getOrThrowIfEmpty(env.IAM_SESSION_CREDENTIALS_TABLE_NAME),
  OIDC_IDP_NAME: getOrThrowIfEmpty(env.OIDC_IDP_NAME),
  OIDC_ISSUER_URL: getOrThrowIfEmpty(env.OIDC_ISSUER_URL),
  OIDC_CLIENT_ID: getOrThrowIfEmpty(env.OIDC_CLIENT_ID),
  OIDC_CLIENT_SECRET_NAME: getOrThrowIfEmpty(env.OIDC_CLIENT_SECRET_NAME),
  OIDC_REDIRECT_URL: getOrThrowIfEmpty(env.OIDC_REDIRECT_URL),
  KMS_KEY_ARN: getOrThrowIfEmpty(env.KEY_ARN),
  Q_USER_API_ROLE_ARN: getOrThrowIfEmpty(env.Q_USER_API_ROLE_ARN),
  GATEWAY_IDC_APP_ARN: getOrThrowIfEmpty(env.GATEWAY_IDC_APP_ARN)
});

export type SlackEventsEnv = ReturnType<typeof processSlackEventsEnv>;

const MAX_FILE_ATTACHMENTS = 5;
const SUPPORTED_FILE_TYPES = [
  'text',
  'html',
  'xml',
  'markdown',
  'csv',
  'json',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'doc',
  'docx',
  'rtf',
  'pdf'
];
const attachFiles = async (
  slackEventsEnv: SlackEventsEnv,
  files: FileElement[]
): Promise<AttachmentInput[]> => {
  const newAttachments: AttachmentInput[] = [];
  for (const f of files) {
    // Check if the file type is supported
    if (
      !isEmpty(f.filetype) &&
      SUPPORTED_FILE_TYPES.includes(f.filetype) &&
      !isEmpty(f.url_private_download) &&
      !isEmpty(f.name)
    ) {
      newAttachments.push({
        name: f.name,
        data: await chatDependencies.retrieveAttachment(slackEventsEnv, f.url_private_download)
      });
    } else {
      logger.debug(
        `Ignoring file attachment with unsupported filetype '${f.filetype}' - not one of '${SUPPORTED_FILE_TYPES}'`
      );
    }
  }
  return newAttachments;
};

const FEEDBACK_MESSAGE = 'Open Slack to provide feedback';

export const handler = async (
  event: {
    body: string;
    headers: { [key: string]: string | undefined };
  },
  _context: Context,
  _callback: Callback,
  dependencies = {
    ...chatDependencies,
    validateSlackRequest,
    getSessionCreds,
    startSession
  },
  slackEventsEnv: SlackEventsEnv = processSlackEventsEnv(process.env)
): Promise<APIGatewayProxyResult> => {
  logger.debug(`Received event: ${JSON.stringify(event)}`);

  logger.debug(`dependencies ${JSON.stringify(dependencies)}`);
  if (isEmpty(event.body)) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: 'Bad request'
      })
    };
  }

  // You would want to ensure that this method is always here before you start parsing the request
  // For extra safety it is recommended to have a Synthetic test (aka Canary) via AWS that will
  // Call this method with an invalid signature and verify that the status code is 403
  // You can define a CDK construct for it.
  if (!(await dependencies.validateSlackRequest(event.headers, event.body, slackEventsEnv))) {
    logger.warn(`Invalid request`);
    return {
      statusCode: 403,
      body: JSON.stringify({
        error: 'Forbidden'
      })
    };
  }

  const body = JSON.parse(event.body);
  logger.debug(`Received message body ${JSON.stringify(body)}`);

  // Read why it is needed: https://api.slack.com/events/url_verification
  if (!isEmpty(body.challenge)) {
    return { statusCode: 200, body: body.challenge };
  }

  if (body.event && body.event.bot_id) {
    logger.debug(`Ignoring bot message`);
    return {
      statusCode: 200,
      body: JSON.stringify({
        error: `Ignoring bot message`
      })
    };
  }

  if (!isEmpty(event.headers['X-Slack-Retry-Reason'])) {
    const retry_reason = event.headers['X-Slack-Retry-Reason'];
    const retry_num = event.headers['X-Slack-Retry-Num'];
    logger.debug(
      `Ignoring retry event (avoid duplicate bot requests): Retry-Reason '${retry_reason}', Retry-Num '${retry_num}'`
    );

    return {
      statusCode: 200,
      body: JSON.stringify({
        error: `Ignoring retry event: Retry-Reason '${retry_reason}', Retry-Num '${retry_num}`
      })
    };
  }

  // Ignore messages from the bot
  if (body.event.subtype === 'bot_message' || body.event.user === undefined) {
    logger.debug(`Ignoring bot message`);
    return {
      statusCode: 200,
      body: JSON.stringify({
        error: `Ignoring bot message`
      })
    };
  }

  // Validate if the Slack user has a valid IAM session
  let iamSessionCreds: Credentials;
  const sessionManagerEnv: SessionManagerEnv = {
    oidcStateTableName: slackEventsEnv.OIDC_STATE_TABLE_NAME,
    iamSessionCredentialsTableName: slackEventsEnv.IAM_SESSION_TABLE_NAME,
    oidcIdPName: slackEventsEnv.OIDC_IDP_NAME,
    oidcClientId: slackEventsEnv.OIDC_CLIENT_ID,
    oidcClientSecretName: slackEventsEnv.OIDC_CLIENT_SECRET_NAME,
    oidcIssuerUrl: slackEventsEnv.OIDC_ISSUER_URL,
    oidcRedirectUrl: slackEventsEnv.OIDC_REDIRECT_URL,
    kmsKeyArn: slackEventsEnv.KMS_KEY_ARN,
    region: slackEventsEnv.AMAZON_Q_REGION,
    qUserAPIRoleArn: slackEventsEnv.Q_USER_API_ROLE_ARN,
    gatewayIdCAppArn: slackEventsEnv.GATEWAY_IDC_APP_ARN
  };

  try {
    iamSessionCreds = await dependencies.getSessionCreds(sessionManagerEnv, body.event.user);
  } catch (error) {
    // call sessionManager.startSession() to start a new session
    logger.error(`Failed to get session: ${error}`);
    const authorizationURL = await dependencies.startSession(sessionManagerEnv, body.event.user);

    // post a message to channel to return a slack button for authorization url
    const blocks = getSignInBlocks(authorizationURL);
    await dependencies.sendSlackMessage(
      slackEventsEnv,
      body.event.user,
      `<@${body.event.user}>, please sign in through the Amazon Q bot app to continue.`,
      blocks,
      body.event.type === 'app_mention' ? body.event.ts : undefined
    );

    // return 200 ok message
    return {
      statusCode: 200,
      headers: {
        'x-slack-no-retry': '1'
      },
      body: JSON.stringify({
        body: 'Authorization Required'
      })
    };
  }

  // handle message and threads with app_mention
  if (!['message', 'app_mention'].includes(body.event.type) || isEmpty(body.event.client_msg_id)) {
    console.log(`Ignoring type: ${body.type}`);
    return {
      statusCode: 200,
      body: JSON.stringify({
        error: `Unsupported body type ${body.type}`
      })
    };
  }

  if (isEmpty(body.event.channel) || isEmpty(body.event.text)) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        error: `No channel or text to response from`
      })
    };
  }

  const channelKey = getChannelKey(
    body.event.type,
    body.team_id,
    body.event.channel,
    body.event.event_ts,
    body.event.thread_ts
  );

  const channelMetadata = await getChannelMetadata(channelKey, dependencies, slackEventsEnv);
  logger.debug(
    `ChannelKey: ${channelKey}, Cached channel metadata: ${JSON.stringify(channelMetadata)} `
  );

  const context = {
    conversationId: channelMetadata?.conversationId,
    parentMessageId: channelMetadata?.systemMessageId
  };

  let attachments: AttachmentInput[] = [];
  const input = [];
  const userInformationCache: Record<string, UsersInfoResponse> = {};
  const stripMentions = (text?: string) => text?.replace(/<@[A-Z0-9]+>/g, '').trim();

  // retrieve and cache user info
  if (isEmpty(userInformationCache[body.event.user])) {
    userInformationCache[body.event.user] = await dependencies.getUserInfo(
      slackEventsEnv,
      body.event.user
    );
  }

  if (!isEmpty(body.event.thread_ts)) {
    const threadHistory = await dependencies.retrieveThreadHistory(
      slackEventsEnv,
      body.event.channel,
      body.event.thread_ts
    );

    if (threadHistory.ok && !isEmpty(threadHistory.messages)) {
      const promptConversationHistory = [];
      // The last message in the threadHistory result is also the current message, so
      // to avoid duplicating chatHistory with the current message we skip the
      // last element in threadHistory message array.
      for (const m of threadHistory.messages.slice(0, -1)) {
        if (isEmpty(m.user)) {
          continue;
        }

        if (m.text === FEEDBACK_MESSAGE) {
          continue;
        }

        if (isEmpty(userInformationCache[m.user])) {
          userInformationCache[m.user] = await dependencies.getUserInfo(slackEventsEnv, m.user);
        }

        promptConversationHistory.push({
          name: userInformationCache[m.user].user?.real_name,
          message: stripMentions(m.text),
          date: !isEmpty(m.ts) ? new Date(Number(m.ts) * 1000).toISOString() : undefined
        });

        if (!isEmpty(m.files)) {
          attachments.push(...(await attachFiles(slackEventsEnv, m.files)));
        }
      }

      if (promptConversationHistory.length > 0) {
        // We clear the history and start a new conversation because we inject the context in the prompt
        context.conversationId = undefined;
        context.parentMessageId = undefined;

        input.push(
          `Given the following conversation thread history in JSON:\n${JSON.stringify(
            promptConversationHistory
          )}`
        );
      }
    }
  }

  input.push(stripMentions(body.event.text));
  const prompt = input.join(`\n${'-'.repeat(10)}\n`);

  // attach files (if any) from current message
  if (!isEmpty(body.event.files)) {
    attachments.push(...(await attachFiles(slackEventsEnv, body.event.files)));
  }
  // Limit file attachments to the last MAX_FILE_ATTACHMENTS
  if (attachments.length > MAX_FILE_ATTACHMENTS) {
    logger.debug(
      `Too many attached files (${attachments.length}). Attaching the last ${MAX_FILE_ATTACHMENTS} files.`
    );
    attachments = attachments.slice(-MAX_FILE_ATTACHMENTS);
  }

  const [output, slackMessage] = await Promise.all([
    chat(body.event.user, prompt, attachments, dependencies, slackEventsEnv, iamSessionCreds, context),
    dependencies.sendSlackMessage(
      slackEventsEnv,
      body.event.channel,
      `Processing...`,
      [getMarkdownBlock(`Processing...`)],
      body.event.type === 'app_mention' ? body.event.ts : undefined
    )
  ]);
  
  if (output instanceof Error) {
    const errMsgWithDetails = `${ERROR_MSG}\n_${output.message}_`;
    const blocks = [getMarkdownBlock(errMsgWithDetails)];
    await dependencies.updateSlackMessage(slackEventsEnv, slackMessage, errMsgWithDetails, blocks);
    return {
      statusCode: 200,
      body: JSON.stringify({
        chat: { context, input, output, blocks },
        error: output
      })
    };
  }
  
  let buffer = '';
  const bufferSize = 25;
  let failedAttachmentEvents: FailedAttachmentEvent[] = [];
  let latestMetadataEvent: MetadataEvent | undefined;
  let latestTextEvent: TextOutputEvent | undefined;
  
  let outputData = {
    conversationId: undefined as string | undefined,
    systemMessageId: undefined as string | undefined,
    outputText: '',
    outputStream: [] as ChatOutputStream[],
  };
  
  if (!output.outputStream) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        chat: { context, prompt, output: {
          ...outputData,
          $metadata: output.$metadata,
        }}
      })
    };
  }
  
  for await (const event of output.outputStream) {
    if (event.textEvent) {
      latestTextEvent = event.textEvent;
      buffer += latestTextEvent.systemMessage;
  
      if (buffer.length >= bufferSize) {
        outputData.outputText += buffer;
        await dependencies.updateSlackMessage(
          slackEventsEnv,
          slackMessage,
          outputData.outputText,
          getResponseAsBlocks(outputData.outputText, latestTextEvent.systemMessageId ?? '')
        );
        buffer = '';
      }
    }
  
    else if (event.failedAttachmentEvent) {
      failedAttachmentEvents.push(event.failedAttachmentEvent);
    }
    else if (event.metadataEvent) {
      latestMetadataEvent = event.metadataEvent;
      outputData.conversationId = latestMetadataEvent.conversationId ?? '';
      outputData.systemMessageId = latestMetadataEvent.systemMessageId ?? '';
    }
    outputData.outputStream.push(event);
  }
  
  if (!latestTextEvent?.systemMessageId) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        chat: { context, prompt, output: {
          ...outputData,
          $metadata: output.$metadata,
        }}
      })
    };
  }
  
  if (failedAttachmentEvents.length > 0) {
    const fileErrorMessages = failedAttachmentEvents.map(f => 
      `\u2022 ${f.attachment?.name}: ${f.attachment?.error?.errorMessage || 'Unknown error'}`
    );
    outputData.outputText += `\n\n*_Failed attachments:_*\n${fileErrorMessages.join('\n')}`;
  }
  
  if (!latestMetadataEvent) {
    return {
      statusCode: 200,
      body: JSON.stringify({
        chat: { context, prompt, output: {
          ...outputData,
          $metadata: output.$metadata,
        }}
      })
    };
  }
  
  outputData.outputText += buffer;
  const contentBlocks = getResponseAsBlocks(outputData.outputText, latestMetadataEvent.systemMessageId ?? '', latestMetadataEvent.sourceAttributions || []);
  const feedbackBlocks = getFeedbackBlocks(latestTextEvent);
  await Promise.all([
    saveChannelMetadata(channelKey, latestMetadataEvent.conversationId ?? '', latestMetadataEvent.systemMessageId ?? '', dependencies, slackEventsEnv),
    saveMessageMetadata(latestMetadataEvent, dependencies, slackEventsEnv),
    dependencies.updateSlackMessage(
      slackEventsEnv,
      slackMessage,
      outputData.outputText,
      contentBlocks
    )
  ]);

  await dependencies.sendSlackMessage(
    slackEventsEnv,
    body.event.channel,
    FEEDBACK_MESSAGE,
    feedbackBlocks,
    body.event.type === 'app_mention' ? body.event.ts : undefined
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      chat: {
        context,
        prompt,
        output: {
          ...outputData,
          $metadata: output.$metadata,
        },
        blocks: [...contentBlocks, ...feedbackBlocks]
      }
    })
  }
};