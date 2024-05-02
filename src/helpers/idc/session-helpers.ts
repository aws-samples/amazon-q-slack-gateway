import { Credentials, SecretsManager } from 'aws-sdk';
import { makeLogger } from '@src/logging';
import axios from 'axios';
import { deleteItem, getItem, putItem } from '@helpers/dynamodb-client';
import { CreateTokenWithIAMRequest, SSOOIDC } from '@aws-sdk/client-sso-oidc';
import { AssumeRoleRequest, STS } from '@aws-sdk/client-sts';
import jwt from 'jsonwebtoken';
import * as crypto from 'crypto';
import { decryptData, encryptData } from '@helpers/idc/encryption-helpers';

const logger = makeLogger('slack-helpers');

let secretManagerClient: SecretsManager | null = null;

export type SessionManagerEnv = {
  oidcStateTableName: string;
  iamSessionCredentialsTableName: string;
  oidcIdPName: string;
  oidcIssuerUrl: string;
  oidcClientId: string;
  oidcClientSecretName: string;
  oidcRedirectUrl: string;
  kmsKeyArn: string;
  region: string;
  qUserAPIRoleArn: string;
  gatewayIdCAppArn: string;
};

type Session = {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken: string;
  expiration: string;
  refreshToken?: string;
};

export const getSessionCreds = async (env: SessionManagerEnv, slackUserId: string) => {
  logger.debug(`Getting session for slackUserId ${slackUserId}`);

  let session = await loadSession(env, slackUserId);

  if (!hasSessionExpired(session.expiration)) {
    return new Credentials(session.accessKeyId, session.secretAccessKey, session.sessionToken);
  }

  logger.debug('Session has expired');

  if (session.refreshToken === undefined) {
    logger.debug('No refresh token found');
    throw new Error('SessionExpiredException');
  }

  logger.debug(`Refreshing session for slackUserId ${slackUserId}`);
  const oidcSecrets = await getOIDCClientSecret(env.oidcClientSecretName, env.region);
  const clientSecret = oidcSecrets.OIDCClientSecret;

  // get token endpoint
  const oidcEndpoints = await getOIDCEndpoints(env.oidcIssuerUrl);
  const tokenEndpoint = oidcEndpoints.tokenEndpoint;
  const refreshedTokens = await refreshToken(
    session.refreshToken,
    env.oidcClientId,
    clientSecret,
    tokenEndpoint
  );

  // exchange IdP id token for IAM session
  session = await exchangeIdPTokenForIAMSessionCreds(
    slackUserId,
    env,
    refreshedTokens.id_token,
    refreshedTokens.refresh_token
  );

  // save session
  await saveSession(env, slackUserId, session);

  return new Credentials(session.accessKeyId, session.secretAccessKey, session.sessionToken);
};

export const startSession = async (env: SessionManagerEnv, slackUserId: string) => {
  const state = crypto.randomBytes(16).toString('hex');
  const timestamp = new Date().toISOString();

  logger.debug(`Starting session for slackUserId ${slackUserId} with state ${state}`);
  // compute ttl now since epoch + 5 minutes
  const ttl = Math.floor((Date.now() + 5 * 60 * 1000) / 1000);
  await putItem({
    TableName: env.oidcStateTableName,
    Item: { state: state, slackUserId: slackUserId, timestamp: timestamp, ttl: ttl }
  });

  const oidcEndpoints = await getOIDCEndpoints(env.oidcIssuerUrl);

  let scopes = 'openid email offline_access';
  if (env.oidcIdPName.toLowerCase() === 'okta') {
    // Okta allowed scopes: https://developer.okta.com/docs/api/oauth2/
    scopes = 'openid email offline_access';
  } else if (env.oidcIdPName.toLowerCase() === 'cognito') {
    // Cognito allowed scopes: https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pools-define-resource-servers.html#cognito-user-pools-define-resource-servers-about-scopes
    scopes = 'openid email';
  }
  const encodedScopes = encodeURIComponent(scopes);

  return `${oidcEndpoints.authorizationEndpoint}?response_type=code&client_id=${
    env.oidcClientId
  }&redirect_uri=${encodeURIComponent(env.oidcRedirectUrl)}&state=${state}&scope=${encodedScopes}`;
};

export const finishSession = async (
  env: SessionManagerEnv,
  authorization_code: string,
  state: string
) => {
  const getItemResponse = await getItem({
    TableName: env.oidcStateTableName,
    Key: { state: state }
  });

  if (!getItemResponse.Item) {
    throw new Error('InvalidState');
  }

  // delete state from dynamodb and get the slack user id from the state
  await deleteItem({
    TableName: env.oidcStateTableName,
    Key: { state: state }
  });

  // get slackUserId from the attributes
  const slackUserId = getItemResponse.Item.slackUserId;
  logger.debug(`Slack user id ${slackUserId}`);

  const oidcSecrets = await getOIDCClientSecret(env.oidcClientSecretName, env.region);
  const clientSecret = oidcSecrets.OIDCClientSecret;

  // get token endpoint
  const oidcEndpoints = await getOIDCEndpoints(env.oidcIssuerUrl);
  const tokenEndpoint = oidcEndpoints.tokenEndpoint;

  // exchange code for token
  const data = {
    grant_type: 'authorization_code',
    code: authorization_code,
    redirect_uri: env.oidcRedirectUrl,
    client_id: env.oidcClientId,
    client_secret: clientSecret
  };

  const queryString = toQueryString(data);
  const response = await axios.post(tokenEndpoint, queryString, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  // call exchangeIdPTokenForIAMSessionCreds
  const session = await exchangeIdPTokenForIAMSessionCreds(
    slackUserId,
    env,
    response.data.id_token,
    response.data.refresh_token
  );

  // save session
  await saveSession(env, slackUserId, session);
};

const getSSOOIDCClient = (region: string) => {
  return new SSOOIDC({ region: region });
};

type OIDCSecrets = {
  OIDCClientSecret: string;
};
const getOIDCClientSecret = async (secretName: string, region: string): Promise<OIDCSecrets> => {
  logger.debug(`Getting secret value for SecretId ${secretName}`);
  const secret = await getSecretManagerClient(region)
    .getSecretValue({
      SecretId: secretName
    })
    .promise();

  if (secret.SecretString === undefined) {
    throw new Error(`Missing secret value for ${secretName}`);
  }

  return JSON.parse(secret.SecretString);
};

const getSecretManagerClient = (region: string) => {
  if (secretManagerClient === null) {
    secretManagerClient = new SecretsManager({ region: region });
  }

  return secretManagerClient;
};

type OIDCEndpoints = {
  authorizationEndpoint: string;
  tokenEndpoint: string;
};

async function getOIDCEndpoints(issuerUrl: string): Promise<OIDCEndpoints> {
  const response = await axios.get(`${issuerUrl}/.well-known/openid-configuration`);

  return {
    authorizationEndpoint: response.data.authorization_endpoint,
    tokenEndpoint: response.data.token_endpoint
  };
}

function toQueryString(params: Record<string, string>) {
  const parts = [];
  for (const key in params) {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      const value = params[key];
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    }
  }
  return parts.join('&');
}

type RefreshTokensResponse = {
  id_token: string;
  refresh_token?: string;
};

const refreshToken = async (
  refreshToken: string,
  client_id: string,
  client_secret: string,
  token_endpoint: string
) => {
  const data = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: client_id,
    client_secret: client_secret
  };

  const queryString = toQueryString(data);

  const response = await axios.post(token_endpoint, queryString, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    }
  });

  // parse the response
  const refreshTokensResponse = response.data as RefreshTokensResponse;
  if (refreshTokensResponse.refresh_token === undefined) {
    refreshTokensResponse.refresh_token = refreshToken;
  }

  return refreshTokensResponse;
};

const exchangeIdPTokenForIAMSessionCreds = async (
  slackUserId: string,
  env: SessionManagerEnv,
  idToken: string,
  refreshToken?: string
) => {
  // exchange IdP id token for IdC id token
  const idCAppClientId = env.gatewayIdCAppArn;

  const createTokenWithIAMRequest: CreateTokenWithIAMRequest = {
    clientId: idCAppClientId,
    grantType: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: idToken
  };

  const idcResponse = await getSSOOIDCClient(env.region).createTokenWithIAM(
    createTokenWithIAMRequest
  );

  const idcIdToken = idcResponse.idToken!;

  console.log(`IdC response ${JSON.stringify(idcResponse)}`);

  // decode the jwt token
  const decodedToken = jwt.decode(idcIdToken, { complete: true });

  if (!decodedToken || typeof decodedToken !== 'object' || !decodedToken.payload) {
    throw new Error('Invalid token');
  }

  // Define a type for the payload
  interface Payload {
    'sts:identity_context': string;
  }

  // Extract 'sts:identity-context' claim using type assertion
  const identityContext = (decodedToken.payload as Payload)['sts:identity_context'];

  console.log(identityContext);

  logger.debug(`IdC response ${JSON.stringify(idcResponse)}`);

  // call sts assume role
  const stsClient = new STS({ region: env.region });
  const assumeRoleRequest: AssumeRoleRequest = {
    RoleArn: env.qUserAPIRoleArn,
    RoleSessionName: 'q-gateway-for-slack',
    DurationSeconds: 900,
    ProvidedContexts: [
      {
        ProviderArn: 'arn:aws:iam::aws:contextProvider/IdentityCenter',
        ContextAssertion: identityContext
      }
    ]
  };

  const assumeRoleResponse = await stsClient.assumeRole(assumeRoleRequest);

  // extract access key, secret key and session token and expiry
  const accessKeyId = assumeRoleResponse.Credentials?.AccessKeyId;
  const secretAccessKey = assumeRoleResponse.Credentials?.SecretAccessKey;
  const sessionToken = assumeRoleResponse.Credentials?.SessionToken;
  const expiration = assumeRoleResponse.Credentials?.Expiration;

  // adjust expiration to 2 minutes before actual expiration
  const adjustedExpiration = new Date(expiration!);
  adjustedExpiration.setMinutes(adjustedExpiration.getMinutes() - 2);
  const adjustedExpirationString = adjustedExpiration.toISOString();

  // put credentials in a record
  const sessionCreds: Session = {
    accessKeyId: accessKeyId!,
    secretAccessKey: secretAccessKey!,
    sessionToken: sessionToken!,
    expiration: adjustedExpirationString,
    refreshToken: refreshToken
  };

  return sessionCreds;
};

const saveSession = async (env: SessionManagerEnv, slackUserId: string, sessionCreds: Session) => {
  const sessionCredsString = JSON.stringify(sessionCreds);

  const encryptedCreds = await encryptData(sessionCredsString, env.kmsKeyArn, slackUserId);

  // store these in dynamodb table
  const timestamp = new Date().toISOString();
  await putItem({
    TableName: env.iamSessionCredentialsTableName,
    Item: {
      slackUserId: slackUserId,
      encryptedCreds: encryptedCreds,
      expiration: sessionCreds.expiration,
      timestamp: timestamp
    }
  });
};

const loadSession = async (env: SessionManagerEnv, slackUserId: string) => {
  const getItemResponse = await getItem({
    TableName: env.iamSessionCredentialsTableName,
    Key: { slackUserId: slackUserId }
  });

  if (!getItemResponse.Item) {
    throw new Error('NoSessionExistsException');
  }

  const item = getItemResponse.Item;
  const encryptedCreds: string = item.encryptedCreds;
  const credsString = await decryptData(encryptedCreds, env.kmsKeyArn, slackUserId);

  return JSON.parse(credsString) as Session;
};

const hasSessionExpired = (expiration: string) => {
  const expirationDate = new Date(expiration);
  const now = new Date();

  return expirationDate < now;
};
