import { SlackEventsEnv } from '@functions/slack-event-handler';
import { SlackInteractionsEnv } from '@functions/slack-interaction-handler';

import { ChatContextFile, ChatResponse } from '@helpers/chat';
import { makeLogger } from '@src/logging';
import { v4 as uuid } from 'uuid';

// I am not happy about this but we must to do as those types are not yet available in CDK
/* eslint @typescript-eslint/no-var-requires: "off" */
/* eslint @typescript-eslint/no-explicit-any: "off" */
const AWS = require('aws-sdk');
const logger = makeLogger('enterprise-q-client');

export interface EnterpriseQResponse extends ChatResponse {
  conversationId: string;
  messageId: string;
  aiMessageId: string;
  humanMessageId: string;
  sourceAttribution?: SourceAttribution[];
}

export interface SourceAttribution {
  title?: string;
  snippet?: string;
  url?: string;
}

export const initEnterpriseQSDK = () => {
  AWS.apiLoader.services.expertq = {};
  AWS.ExpertQ = AWS.Service.defineService('expertq', ['2023-07-26']);
  Object.defineProperty(AWS.apiLoader.services.expertq, '2023-07-26', {
    get: function get() {
      const model = require('./enterprise-q.json');
      model.paginators = {};
      return model;
    },
    enumerable: true,
    configurable: true
  });
};

// The any here makes me sad but we do not have a typed def file yet
let enterpriseQClient: unknown = null;
export const getClient = (env: SlackEventsEnv) => {
  if (enterpriseQClient === null) {
    initEnterpriseQSDK();
    logger.debug(
      `Initiating EnterpriseQ client with region ${env.ENTERPRISE_Q_REGION} and endpoint ${env.ENTERPRISE_Q_ENDPOINT}`
    );
    enterpriseQClient = new AWS.ExpertQ({
      region: env.ENTERPRISE_Q_REGION,
      endpoint: env.ENTERPRISE_Q_ENDPOINT
    });
  }

  return enterpriseQClient;
};

export const callClient = async (
  message: string,
  chatContextFiles: ChatContextFile[],
  env: SlackEventsEnv,
  context?: {
    conversationId: string;
    parentMessageId: string;
  }
): Promise<EnterpriseQResponse> => {
  const input = {
    applicationId: env.ENTERPRISE_Q_APP_ID,
    userId: env.ENTERPRISE_Q_USER_ID,
    clientToken: uuid(),
    message,
    ...(chatContextFiles.length > 0 && { chatContextFiles }),
    ...context
  };

  logger.debug(`callClient input ${JSON.stringify(input)}`);
  return await (getClient(env) as any).chatSync(input).promise();
};

export const submitFeedbackRequest = async (
  env: SlackInteractionsEnv,
  context: {
    conversationId: string;
    humanMessageId: string;
    aiMessageId: string;
  },
  relevanceValue: 'NOT_RELEVANT' | 'RELEVANT',
  time: string
): Promise<void> => {
  const input = {
    applicationId: env.ENTERPRISE_Q_APP_ID,
    model: {
      queryRewriting: 'anthropic.claude-v2',
      questionAnswer: 'anthropic.claude-v2'
    },
    relevanceFeedback: {
      relevanceValue,
      time: Number(time)
    },
    ...context
  };

  logger.debug(`submitFeedbackRequest input ${JSON.stringify(input)}`);
  const response = await (getClient(env) as any).submitFeedback(input).promise();
  logger.debug(`submitFeedbackRequest output ${JSON.stringify(response)}`);

  return response;
};
