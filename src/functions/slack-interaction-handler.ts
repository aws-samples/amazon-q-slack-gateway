import { APIGatewayProxyResult, Callback, Context } from 'aws-lambda';
import {
  createModal,
  getMarkdownBlocks,
  openModal,
  SLACK_ACTION,
  validateSlackRequest
} from '@helpers/slack/slack-helpers';
import { getOrThrowIfEmpty, isEmpty } from '@src/utils';
import { makeLogger } from '@src/logging';
import { chatDependencies, getMessageMetadata } from '@helpers/chat';
import { ChatSyncCommandOutput } from '@aws-sdk/client-qbusiness';
import { Credentials } from 'aws-sdk';
import { SessionManagerEnv, getSessionCreds, startSession } from '@helpers/idc/session-helpers';
import { getSignInBlocks } from '@helpers/amazon-q/amazon-q-helpers';

const logger = makeLogger('slack-interactions-handler');

const processSlackInteractionsEnv = (env: NodeJS.ProcessEnv) => ({
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
  GATEWAY_IDC_APP_ARN: getOrThrowIfEmpty(env.GATEWAY_IDC_APP_ARN),
  AWS_IAM_IDC_REGION: getOrThrowIfEmpty(env.AWS_IAM_IDC_REGION)
});

export type SlackInteractionsEnv = ReturnType<typeof processSlackInteractionsEnv>;

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
    openModal,
    getSessionCreds,
    startSession
  },
  slackInteractionsEnv: SlackInteractionsEnv = processSlackInteractionsEnv(process.env)
): Promise<APIGatewayProxyResult> => {
  console.log(`Received event ${JSON.stringify(event)}`);
  console.log(`SlackInteractionsEnv ${JSON.stringify(slackInteractionsEnv)}`);

  if (isEmpty(event.body)) {
    logger.warn(`Empty body`);
    return { statusCode: 400, body: 'Bad request' };
  }

  // You would want to ensure that this method is always here before you start parsing the request
  // For extra safety it is recommended to have a Synthetic test (aka Canary) via AWS that will
  // Call this method with an invalid signature and verify that the status code is 403
  // You can define a CDK construct for it.
  if (!(await dependencies.validateSlackRequest(event.headers, event.body, slackInteractionsEnv))) {
    return { statusCode: 403, body: 'Forbidden' };
  }

  const payloadUrl = new URLSearchParams(event.body);
  if (!payloadUrl.has('payload')) {
    return { statusCode: 200, body: 'No payload. Nothing to do' };
  }

  const payloadParam = payloadUrl.get('payload');
  if (payloadParam === null) {
    return { statusCode: 400, body: 'Invalid input' };
  }

  const payload = JSON.parse(payloadParam);
  logger.debug(`Received event payload: ${JSON.stringify(payload)}`);

  if (payload.type !== 'block_actions') {
    return { statusCode: 200, body: 'Not a block action payload. Not implemented. Nothing to do' };
  }

  if (payload.message === undefined || payload.channel.id === undefined) {
    logger.warn(
      `Missing required parameter for response in ${JSON.stringify(payload)}, ignoring action`
    );
    return {
      statusCode: 200,
      body: 'Missing message and channel id for block action. Cant respond. Ignoring.'
    };
  }

  if (payload.actions === undefined) {
    console.log(`No actions in ${JSON.stringify(payload)}, ignoring`);
    return {
      statusCode: 200,
      body: 'Missing actions. Cant respond. Ignoring.'
    };
  }

  logger.debug(`Received block action interactions: ${JSON.stringify(payload.actions)}`);

  for (const action of payload.actions) {
    const id = action.action_id;
    if (id === SLACK_ACTION[SLACK_ACTION.SIGN_IN]) {
      // post message as signing in
      logger.debug(`Signing in...`);
      await dependencies.updateSlackMessage(
        slackInteractionsEnv,
        { channel: payload.channel.id, ts: payload.message.ts, ok: true },
        `Signing in through your browser...`,
        getMarkdownBlocks(`_Signing in through your browser..._`)
      );

      continue;
    }

    const messageMetadata = (await getMessageMetadata(
      action.value,
      dependencies,
      slackInteractionsEnv
    )) as ChatSyncCommandOutput;

    if (
      id === SLACK_ACTION[SLACK_ACTION.VIEW_SOURCES] &&
      !isEmpty(messageMetadata?.sourceAttributions)
    ) {
      const modal = createModal('Source(s)', messageMetadata.sourceAttributions);

      await dependencies.openModal(
        slackInteractionsEnv,
        payload.trigger_id,
        payload.channel.id,
        modal
      );
    } else if (
      id === SLACK_ACTION[SLACK_ACTION.FEEDBACK_UP] ||
      id === SLACK_ACTION[SLACK_ACTION.FEEDBACK_DOWN]
    ) {
      logger.debug(`Received feedback ${id} for ${JSON.stringify(messageMetadata)}`);

      // Validate if the Slack user has a valid IAM session
      let iamSessionCreds: Credentials;
      const sessionManagerEnv: SessionManagerEnv = {
        oidcStateTableName: slackInteractionsEnv.OIDC_STATE_TABLE_NAME,
        iamSessionCredentialsTableName: slackInteractionsEnv.IAM_SESSION_TABLE_NAME,
        oidcIdPName: slackInteractionsEnv.OIDC_IDP_NAME,
        oidcClientId: slackInteractionsEnv.OIDC_CLIENT_ID,
        oidcClientSecretName: slackInteractionsEnv.OIDC_CLIENT_SECRET_NAME,
        oidcIssuerUrl: slackInteractionsEnv.OIDC_ISSUER_URL,
        oidcRedirectUrl: slackInteractionsEnv.OIDC_REDIRECT_URL,
        kmsKeyArn: slackInteractionsEnv.KMS_KEY_ARN,
        region: slackInteractionsEnv.AMAZON_Q_REGION,
        qUserAPIRoleArn: slackInteractionsEnv.Q_USER_API_ROLE_ARN,
        gatewayIdCAppArn: slackInteractionsEnv.GATEWAY_IDC_APP_ARN,
        awsIAMIdCRegion: slackInteractionsEnv.AWS_IAM_IDC_REGION
      };

      try {
        iamSessionCreds = await dependencies.getSessionCreds(sessionManagerEnv, payload.user.id);
      } catch (error) {
        // call sessionManager.startSession() to start a new session
        logger.error(`Failed to get session: ${error}`);

        const authorizationURL = await dependencies.startSession(
          sessionManagerEnv,
          payload.user.id
        );

        // post a message to channel to return a slack button for authorization url
        await dependencies.sendSlackMessage(
          slackInteractionsEnv,
          payload.user.id,
          `<@${payload.user.id}>, please sign in through the Amazon Q bot app to continue.`,
          getSignInBlocks(authorizationURL)
        );

        // return 200 ok message
        return {
          statusCode: 200,
          body: JSON.stringify({
            // TODO: add more details to the response
            //chat: { context, input, output, blocks }
          })
        };
      }

      await dependencies.submitFeedbackRequest(
        payload.user.id,
        slackInteractionsEnv,
        iamSessionCreds,
        {
          conversationId: messageMetadata.conversationId ?? '',
          messageId: messageMetadata.systemMessageId ?? ''
        },
        id === SLACK_ACTION[SLACK_ACTION.FEEDBACK_UP] ? 'USEFUL' : 'NOT_USEFUL',
        id === SLACK_ACTION[SLACK_ACTION.FEEDBACK_UP] ? 'HELPFUL' : 'NOT_HELPFUL',
        payload.message.ts
      );

      logger.info(`Received feedback ${id} for ${JSON.stringify(messageMetadata)}`);
      await dependencies.updateSlackMessage(
        slackInteractionsEnv,
        { channel: payload.channel.id, ts: payload.message.ts, ok: true },
        `Thanks for your feedback`,
        getMarkdownBlocks(`_Thanks for your feedback_`)
      );
    }
  }

  return { statusCode: 200, body: 'Handled block action interactions!' };
};
