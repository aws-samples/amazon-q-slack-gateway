import { APIGatewayProxyResult, Callback, Context } from 'aws-lambda';
import { getMarkdownBlock, validateSlackRequest } from '@helpers/slack/slack-helpers';
import { chatDependencies, deleteChannelMetadata, getChannelKey } from '@helpers/chat';
import { getOrThrowIfEmpty, isEmpty } from '@src/utils';
import { makeLogger } from '@src/logging';

const logger = makeLogger('slack-command-handler');

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
  GATEWAY_IDC_APP_ARN: getOrThrowIfEmpty(env.GATEWAY_IDC_APP_ARN),
  AWS_IAM_IDC_REGION: getOrThrowIfEmpty(env.AWS_IAM_IDC_REGION)
});

export type SlackEventsEnv = ReturnType<typeof processSlackEventsEnv>;

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

  // body is an url encoded string for slash commands.
  const body = event.body.split('&').reduce(
    (obj, pair) => {
      const [key, value] = pair.split('=').map(decodeURIComponent);
      obj[key] = value;
      return obj;
    },
    {} as Record<string, string>
  );
  logger.debug(`Received slash command body ${JSON.stringify(body)}`);

  let commandStatus;
  if (body.command.startsWith('/new_conv')) {
    const channelKey = getChannelKey('message', body.team_id, body.channel_id, 'n/a');
    logger.debug(`Slash command: ${body.command} - deleting channel metadata for '${channelKey}'`);
    await deleteChannelMetadata(channelKey, dependencies, slackEventsEnv);
    await dependencies.sendSlackMessage(
      slackEventsEnv,
      body.channel_id,
      `Starting New Conversation`,
      [getMarkdownBlock(`_*Starting New Conversation*_`)]
    );
    commandStatus = 'OK';
  } else {
    logger.error(`ERROR - unsupported slash command: ${body.command}`);
    commandStatus = 'Unsupported';
  }
  return {
    statusCode: 200,
    body: `${body.command} - ${commandStatus}`
  };
};
