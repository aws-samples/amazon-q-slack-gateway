import { HttpResponse } from 'aws-sdk';
import enterpriseQValidResponse1TextTable from '@tst/mocks/enterprise-q/valid-response-1.json';
import { getFeedbackBlocks, getResponseAsBlocks } from '@helpers/enterprise-q/enterprise-q-helpers';

export const MOCK_ENV = {
  SLACK_SECRET_NAME: 'SLACK_SECRET_NAME',
  REGION: 'REGION',
  ENTERPRISE_Q_ENDPOINT: 'ENTERPRISE_Q_ENDPOINT',
  ENTERPRISE_Q_APP_ID: 'ENTERPRISE_Q_APP_ID',
  ENTERPRISE_Q_USER_ID: 'ENTERPRISE_Q_USER_ID',
  CACHE_TABLE_NAME: `BOT_ID-BOT_ALIAS_ID-cache`,
  ENTERPRISE_Q_REGION: 'ENTERPRISE_Q_REGION',
  MESSAGE_METADATA_TABLE_NAME: 'MESSAGE_METADATA_TABLE_NAME'
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
  callClient: () => Promise.resolve(enterpriseQValidResponse1TextTable),
  submitFeedbackRequest: () => Promise.resolve(),
  putItem: async () => MOCK_AWS_RESPONSE,
  validateSlackRequest: () => Promise.resolve(true),
  retrieveThreadHistory: () =>
    Promise.resolve({
      ok: true,
      messages: []
    }),
  retrieveAttachment: () => Promise.resolve("mock attachment"),    
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
    })
};
