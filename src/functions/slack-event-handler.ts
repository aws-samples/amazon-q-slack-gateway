import { APIGatewayProxyResult, Callback, Context } from 'aws-lambda';
import { ERROR_MSG, getMarkdownBlock, validateSlackRequest } from '@helpers/slack/slack-helpers';
import {
  chatDependencies,
  getChannelKey,
  getChannelMetadata,
  saveChannelMetadata,
  saveMessageMetadata
} from '@helpers/chat';
import { getOrThrowIfEmpty, isEmpty } from '@src/utils';
import { makeLogger } from '@src/logging';
import { chat } from '@helpers/enterprise-q/enterprise-q-helpers';
import { UsersInfoResponse } from '@slack/web-api';
import { ChatContextFile } from '@src/helpers/chat';

const logger = makeLogger('slack-event-handler');

const processSlackEventsEnv = (env: NodeJS.ProcessEnv) => ({
  REGION: getOrThrowIfEmpty(env.AWS_REGION ?? env.AWS_DEFAULT_REGION),
  SLACK_SECRET_NAME: getOrThrowIfEmpty(env.SLACK_SECRET_NAME),
  ENTERPRISE_Q_ENDPOINT: env.ENTERPRISE_Q_ENDPOINT,
  ENTERPRISE_Q_APP_ID: getOrThrowIfEmpty(env.ENTERPRISE_Q_APP_ID),
  ENTERPRISE_Q_USER_ID: getOrThrowIfEmpty(env.ENTERPRISE_Q_USER_ID),
  ENTERPRISE_Q_REGION: getOrThrowIfEmpty(env.ENTERPRISE_Q_REGION),
  CACHE_TABLE_NAME: getOrThrowIfEmpty(env.CACHE_TABLE_NAME),
  MESSAGE_METADATA_TABLE_NAME: getOrThrowIfEmpty(env.MESSAGE_METADATA_TABLE_NAME)
});

export type SlackEventsEnv = ReturnType<typeof processSlackEventsEnv>;

const MAX_FILE_ATTACHMENTS = 5
const SUPPORTED_FILE_TYPES = ['text', 'html', 'xml', 'markdown', 'csv', 'json', 'xls', 'xlsx', 'ppt', 'pptx', 'doc', 'docx', 'rtf', 'pdf'];
const attachFiles = async(slackEventsEnv: SlackEventsEnv, files: any[]): Promise<ChatContextFile[]> => {
  const newChatContextFiles: ChatContextFile[] = []
  for (const f of files) {
    // Check if the file type is supported
    if (SUPPORTED_FILE_TYPES.includes(f.filetype)) {
      newChatContextFiles.push({
        name: f.name,
        data: await chatDependencies.retrieveAttachment(
          slackEventsEnv,
          f.url_private_download
        )
      });
    } else {
      logger.debug(`Ignoring file attachment with unsupported filetype '${f.filetype}' - not one of '${SUPPORTED_FILE_TYPES}'`);
    }
  }
  return newChatContextFiles;
}

export const handler = async (
  event: {
    body: string;
    headers: { [key: string]: string | undefined };
  },
  _context: Context,
  _callback: Callback,
  dependencies = {
    ...chatDependencies,
    validateSlackRequest
  },
  slackEventsEnv: SlackEventsEnv = processSlackEventsEnv(process.env)
): Promise<APIGatewayProxyResult> => {
  logger.debug(`Received event ${JSON.stringify(event)}`);

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
  logger.debug(`Received body ${JSON.stringify(body)}`);

  // Read why it is needed: https://api.slack.com/events/url_verification
  if (!isEmpty(body.challenge)) {
    return { statusCode: 200, body: body.challenge };
  }

  // You can extend this lambda to handle more event type
  logger.debug(`Received event ${JSON.stringify(body.event)}`);

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
    body.event.team,
    body.event.channel,
    body.event.event_ts,
    body.event.thread_ts
  );

  const channelMetadata = await getChannelMetadata(channelKey, dependencies, slackEventsEnv);

  const context = {
    conversationId: channelMetadata?.conversationId,
    parentMessageId: channelMetadata?.systemMessageId
  };

  let chatContextFiles: ChatContextFile[] = [];  
  const input = [];
  const userInformationCache: Record<string, UsersInfoResponse> = {};
  const stripMentions = (text?: string) => text?.replace(/<@[A-Z0-9]+>/g, '').trim();

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
      for (const m of threadHistory.messages.slice(0,-1)) {
        if (isEmpty(m.user)) {
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
          chatContextFiles.push(...await attachFiles(slackEventsEnv, m.files));
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
    chatContextFiles.push(...await attachFiles(slackEventsEnv, body.event.files));
  }
  // Limit file attachments to the last MAX_FILE_ATTACHMENTS
  if (chatContextFiles.length > MAX_FILE_ATTACHMENTS) {
    logger.debug(`Too many attached files (${chatContextFiles.length}). Attaching the last ${MAX_FILE_ATTACHMENTS} files.`)
    chatContextFiles = chatContextFiles.slice(-MAX_FILE_ATTACHMENTS);
  }

  const [output, slackMessage] = await Promise.all([
    chat(prompt, chatContextFiles, dependencies, slackEventsEnv, context),
    dependencies.sendSlackMessage(
      slackEventsEnv,
      body.event.channel,
      `Processing...`,
      [getMarkdownBlock(`Processing...`)],
      body.event.type === 'app_mention' ? body.event.ts : undefined
    )
  ]);

  if (output instanceof Error) {
    const blocks = [getMarkdownBlock(ERROR_MSG)];

    await dependencies.updateSlackMessage(slackEventsEnv, slackMessage, ERROR_MSG, blocks);

    return {
      statusCode: 200,
      body: JSON.stringify({
        chat: { context, input, output, blocks },
        error: output
      })
    };
  }

  const blocks = [
    ...dependencies.getResponseAsBlocks(output),
    ...dependencies.getFeedbackBlocks(output)
  ];

  await Promise.all([
    saveChannelMetadata(
      channelKey,
      output.conversationId,
      output.systemMessageId,
      dependencies,
      slackEventsEnv
    ),
    saveMessageMetadata(output, dependencies, slackEventsEnv),
    dependencies.updateSlackMessage(
      slackEventsEnv,
      slackMessage,
      output.systemMessage,
      dependencies.getResponseAsBlocks(output)
    )
  ]);

  await dependencies.sendSlackMessage(
    slackEventsEnv,
    body.event.channel,
    `Open Slack to provide feedback`,
    dependencies.getFeedbackBlocks(output),
    body.event.type === 'app_mention' ? body.event.ts : undefined
  );

  return {
    statusCode: 200,
    body: JSON.stringify({
      chat: { context, prompt, output, blocks }
    })
  };
};
