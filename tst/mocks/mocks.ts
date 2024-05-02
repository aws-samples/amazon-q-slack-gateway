import { Credentials, HttpResponse } from 'aws-sdk';
import amazonQValidResponse1TextTable from '@tst/mocks/amazon-q/valid-response-1.json';
import { getFeedbackBlocks, getResponseAsBlocks } from '@helpers/amazon-q/amazon-q-helpers';
import { ChatSyncCommandOutput, PutFeedbackCommandOutput } from '@aws-sdk/client-qbusiness';

export const MOCK_ENV = {
  SLACK_SECRET_NAME: 'SLACK_SECRET_NAME',
  REGION: 'REGION',
  AMAZON_Q_ENDPOINT: 'AMAZON_Q_ENDPOINT',
  AMAZON_Q_APP_ID: 'AMAZON_Q_APP_ID',
  AMAZON_Q_USER_ID: 'AMAZON_Q_USER_ID',
  CONTEXT_DAYS_TO_LIVE: 'N',
  CACHE_TABLE_NAME: `CACHE_TABLE_NAME`,
  AMAZON_Q_REGION: 'AMAZON_Q_REGION',
  MESSAGE_METADATA_TABLE_NAME: 'MESSAGE_METADATA_TABLE_NAME',
  OIDC_STATE_TABLE_NAME: 'OIDC_STATE_TABLE_NAME',
  IAM_SESSION_TABLE_NAME: 'IAM_SESSION_TABLE_NAME',
  OIDC_IDP_NAME: 'OIDC_IDP_NAME',
  OIDC_ISSUER_URL: 'OIDC_ISSUER_URL',
  OIDC_CLIENT_ID: 'OIDC_CLIENT_ID',
  OIDC_REDIRECT_URL: 'OIDC_REDIRECT_URL',
  KMS_KEY_ARN: 'KMS_KEY_ARN',
  OIDC_CLIENT_SECRET_NAME: 'OIDC_CLIENT_SECRET_NAME',
  Q_USER_API_ROLE_ARN: 'Q_USER_API_ROLE_ARN',
  GATEWAY_IDC_APP_ARN: 'GATEWAY_IDC_APP_ARN'
};

/* eslint @typescript-eslint/no-explicit-any: "off" */
export const MOCK_AWS_RESPONSE = {
  $response: {
    hasNextPage: () => false,
    nextPage: () => ({}) as any,
    data: {},
    error: undefined,
    requestId: 'requestId',
    redirectCount: 0,
    retryCount: 0,
    httpResponse: {} as HttpResponse
  }
};

export const MOCK_DEPENDENCIES = {
  callClient: () => Promise.resolve(amazonQValidResponse1TextTable as ChatSyncCommandOutput),
  submitFeedbackRequest: () => Promise.resolve({} as PutFeedbackCommandOutput),
  deleteItem: async () => MOCK_AWS_RESPONSE,
  putItem: async () => MOCK_AWS_RESPONSE,
  validateSlackRequest: () => Promise.resolve(true),
  retrieveThreadHistory: () =>
    Promise.resolve({
      ok: true,
      messages: []
    }),
  retrieveAttachment: () => Promise.resolve('mock attachment'),
  sendSlackMessage: () => Promise.resolve({} as any),
  updateSlackMessage: () => Promise.resolve({} as any),
  openModal: () => Promise.resolve({} as any),
  getResponseAsBlocks,
  getFeedbackBlocks,
  getUserInfo: () =>
    Promise.resolve({
      ok: true,
      user: {
        id: 'W012A3CDE',
        team_id: 'T012AB3C4',
        name: 'spengler',
        real_name: 'Gregory Spengler'
      }
    }),
  getItem: async () =>
    Promise.resolve({
      Item: undefined,
      ...MOCK_AWS_RESPONSE
    }),
  getSessionCreds: () => Promise.resolve({} as any),
  startSession: () => Promise.resolve({} as any)
};

export const MOCK_IAM_SESSION_CREDS: Credentials = {
  accessKeyId: 'accessKeyId',
  secretAccessKey: 'secretAccessKey',
  sessionToken: 'sessionToken',
  expired: false,
  expireTime: new Date(),
  refreshPromise(): Promise<void> {
    return Promise.resolve();
  },
  get: function (callback) {
    callback(undefined);
  },
  getPromise: function () {
    return Promise.resolve();
  },
  needsRefresh: function () {
    return false;
  },
  refresh: function (callback) {
    callback(undefined);
  }
};
