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
import { EnterpriseQResponse } from '@helpers/enterprise-q/enterprise-q-client';

const logger = makeLogger('slack-interactions-handler');

const processSlackInteractionsEnv = (env: NodeJS.ProcessEnv) => ({
  REGION: getOrThrowIfEmpty(env.AWS_REGION ?? env.AWS_DEFAULT_REGION),
  SLACK_SECRET_NAME: getOrThrowIfEmpty(env.SLACK_SECRET_NAME),
  ENTERPRISE_Q_ENDPOINT: env.ENTERPRISE_Q_ENDPOINT,
  ENTERPRISE_Q_APP_ID: getOrThrowIfEmpty(env.ENTERPRISE_Q_APP_ID),
  ENTERPRISE_Q_USER_ID: getOrThrowIfEmpty(env.ENTERPRISE_Q_USER_ID),
  ENTERPRISE_Q_REGION: getOrThrowIfEmpty(env.ENTERPRISE_Q_REGION),
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
  logger.debug(JSON.stringify(payload));

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
    )) as EnterpriseQResponse;
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
      await dependencies.submitFeedbackRequest(
        slackInteractionsEnv,
        {
          conversationId: messageMetadata.conversationId,
          userMessageId: messageMetadata.userMessageId,
          systemMessageId: messageMetadata.systemMessageId
        },
        id === SLACK_ACTION[SLACK_ACTION.FEEDBACK_UP] ? 'RELEVANT' : 'NOT_RELEVANT',
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
