import { getOrThrowIfEmpty } from '@src/utils';
import { makeLogger } from '@src/logging';
import { finishSession, SessionManagerEnv } from '@helpers/idc/session-helpers';
import { APIGatewayProxyEvent, APIGatewayProxyResult, Callback, Context } from 'aws-lambda';
import { CloudFormation } from 'aws-sdk';

const logger = makeLogger('oidc-callback-handler');

const processOIDCCallbackEventEnv = (env: NodeJS.ProcessEnv) => ({
  CFN_STACK_NAME: getOrThrowIfEmpty(env.CFN_STACK_NAME),
  CALLBACK_API_ENDPOINT_EXPORTED_NAME: getOrThrowIfEmpty(env.CALLBACK_API_ENDPOINT_EXPORTED_NAME),
  AMAZON_Q_REGION: getOrThrowIfEmpty(env.AMAZON_Q_REGION),
  OIDC_STATE_TABLE_NAME: getOrThrowIfEmpty(env.OIDC_STATE_TABLE_NAME),
  IAM_SESSION_TABLE_NAME: getOrThrowIfEmpty(env.IAM_SESSION_CREDENTIALS_TABLE_NAME),
  OIDC_IDP_NAME: getOrThrowIfEmpty(env.OIDC_IDP_NAME),
  OIDC_ISSUER_URL: getOrThrowIfEmpty(env.OIDC_ISSUER_URL),
  OIDC_CLIENT_ID: getOrThrowIfEmpty(env.OIDC_CLIENT_ID),
  OIDC_CLIENT_SECRET_NAME: getOrThrowIfEmpty(env.OIDC_CLIENT_SECRET_NAME),
  KMS_KEY_ARN: getOrThrowIfEmpty(env.KEY_ARN),
  Q_USER_API_ROLE_ARN: getOrThrowIfEmpty(env.Q_USER_API_ROLE_ARN),
  GATEWAY_IDC_APP_ARN: getOrThrowIfEmpty(env.GATEWAY_IDC_APP_ARN)
});

export const handler = async (
  event: APIGatewayProxyEvent,
  _context: Context,
  _callback: Callback,
  dependencies = {
    finishSession
  },
  oidcCallbackEventEnv: ReturnType<
    typeof processOIDCCallbackEventEnv
  > = processOIDCCallbackEventEnv(process.env)
): Promise<APIGatewayProxyResult> => {
  logger.debug(`Received GET request query parameters:  ${JSON.stringify(event)}`);
  logger.debug(`env: ${JSON.stringify(oidcCallbackEventEnv)}`);

  const oidcRedirectURL = await getExportedValue(
    oidcCallbackEventEnv.CFN_STACK_NAME,
    oidcCallbackEventEnv.CALLBACK_API_ENDPOINT_EXPORTED_NAME
  );

  const sessionManagerEnv: SessionManagerEnv = {
    oidcStateTableName: oidcCallbackEventEnv.OIDC_STATE_TABLE_NAME,
    iamSessionCredentialsTableName: oidcCallbackEventEnv.IAM_SESSION_TABLE_NAME,
    oidcIdPName: oidcCallbackEventEnv.OIDC_IDP_NAME,
    oidcClientId: oidcCallbackEventEnv.OIDC_CLIENT_ID,
    oidcClientSecretName: oidcCallbackEventEnv.OIDC_CLIENT_SECRET_NAME,
    oidcIssuerUrl: oidcCallbackEventEnv.OIDC_ISSUER_URL,
    kmsKeyArn: oidcCallbackEventEnv.KMS_KEY_ARN,
    region: oidcCallbackEventEnv.AMAZON_Q_REGION,
    qUserAPIRoleArn: oidcCallbackEventEnv.Q_USER_API_ROLE_ARN,
    gatewayIdCAppArn: oidcCallbackEventEnv.GATEWAY_IDC_APP_ARN,
    oidcRedirectUrl: oidcRedirectURL
  };

  const queryStringParameters = event.queryStringParameters ?? {};
  if (!queryStringParameters.code || !queryStringParameters.state) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        message: 'Invalid request'
      })
    };
  }

  logger.info(`Invoking finish session with oidc redirect url ${oidcRedirectURL}`);
  try {
    await dependencies.finishSession(
      sessionManagerEnv,
      queryStringParameters.code,
      queryStringParameters.state
    );

    return {
      headers: {
        'Content-Type': 'text/plain'
      },
      statusCode: 200,
      body: 'Authentication successful. You can close this window and return to Slack.'
    };
  } catch (error) {
    logger.error(`Error finishing session: ${error}`);
    return {
      headers: {
        'Content-Type': 'text/plain'
      },
      statusCode: 500,
      body: 'Internal server error'
    };
  }
};

const getExportedValue = async (stackName: string, exportedName: string): Promise<string> => {
  const cloudFormation = new CloudFormation();
  let nextToken: string | undefined;
  let exportedValue: string | undefined;

  do {
    const listExportsResponse = await cloudFormation
      .listExports({ NextToken: nextToken })
      .promise();

    const foundExport = listExportsResponse.Exports?.find(
      (exp) => exp && exp.Name === exportedName
    );

    if (foundExport) {
      exportedValue = foundExport.Value;
      break;
    }

    nextToken = listExportsResponse.NextToken;
  } while (nextToken);

  return getOrThrowIfEmpty(
    exportedValue,
    `Exported value for ${exportedName} in stack ${stackName} is empty`
  );
};
