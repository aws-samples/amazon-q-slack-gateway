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
import { AmazonQResponse } from '@helpers/amazon-q/amazon-q-client';

const logger = makeLogger('slack-interactions-handler');

const processSlackInteractionsEnv = (env: NodeJS.ProcessEnv) => ({
  REGION: getOrThrowIfEmpty(env.AWS_REGION ?? env.AWS_DEFAULT_REGION),
  SLACK_SECRET_NAME: getOrThrowIfEmpty(env.SLACK_SECRET_NAME),
  AMAZON_Q_ENDPOINT: env.AMAZON_Q_ENDPOINT,
  AMAZON_Q_APP_ID: getOrThrowIfEmpty(env.AMAZON_Q_APP_ID),
  AMAZON_Q_USER_ID: env.AMAZON_Q_USER_ID,
  AMAZON_Q_REGION: getOrThrowIfEmpty(env.AMAZON_Q_REGION),
  CONTEXT_DAYS_TO_LIVE: getOrThrowIfEmpty(env.CONTEXT_DAYS_TO_LIVE),
  CACHE_TABLE_NAME: getOrThrowIfEmpty(env.CACHE_TABLE_NAME),
  MESSAGE_METADATA_TABLE_NAME: getOrThrowIfEmpty(env.MESSAGE_METADATA_TABLE_NAME)
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
    openModal
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

  for (const action of payload.actions) {
    const id = action.action_id;
    const messageMetadata = (await getMessageMetadata(
      action.value,
      dependencies,
      slackInteractionsEnv
    )) as AmazonQResponse;
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
      if (isEmpty(slackInteractionsEnv.AMAZON_Q_USER_ID)) {
        // Use slack user email as Q UserId
        const userEmail = (await dependencies.getUserInfo(slackInteractionsEnv, payload.user.id))
          .user?.profile?.email;
        slackInteractionsEnv.AMAZON_Q_USER_ID = userEmail;
        logger.debug(
          `User's email (${userEmail}) used as Amazon Q userId, since AmazonQUserId is empty.`
        );
      }

      await dependencies.submitFeedbackRequest(
        slackInteractionsEnv,
        {
          conversationId: messageMetadata.conversationId,
          messageId: messageMetadata.systemMessageId
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

  // TODO: implement logic for interactions
  return { statusCode: 200, body: 'Handled block action interactions!' };
};
