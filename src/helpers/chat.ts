import { SlackEventsEnv } from '@functions/slack-event-handler';
import { Block } from '@slack/web-api';
import {
  EnterpriseQResponse,
  callClient,
  submitFeedbackRequest
} from '@helpers/enterprise-q/enterprise-q-client';
import { getItem, putItem } from '@helpers/dynamodb-client';
import {
  getUserInfo,
  retrieveThreadHistory,
  sendSlackMessage,
  updateSlackMessage
} from '@helpers/slack/slack-helpers';
import { getFeedbackBlocks, getResponseAsBlocks } from '@helpers/enterprise-q/enterprise-q-helpers';

export interface ChatResponse {
  textMessage: string;
}

export const chatDependencies = {
  callClient,
  submitFeedbackRequest,
  getItem,
  putItem,
  sendSlackMessage,
  updateSlackMessage,
  getResponseAsBlocks,
  getFeedbackBlocks,
  retrieveThreadHistory,
  getUserInfo
};

export type ChatDependencies = typeof chatDependencies;

export type callClient = (
  message: string,
  env: SlackEventsEnv,
  context?: { conversationId: string; parentMessageId: string }
) => ChatResponse;

export type getResponseAsBlocks = (response: ChatResponse) => Block[] | undefined;

export const getChannelKey = (
  type: 'message' | 'app_mention',
  team: string,
  channel: string,
  event_ts: string,
  thread_ts?: string
) => (type === 'message' ? `${team}:${channel}` : `${team}:${channel}:${thread_ts ?? event_ts}`);

export const getChannelMetadata = async (
  channel: string,
  dependencies: ChatDependencies,
  env: SlackEventsEnv
) =>
  (
    await dependencies.getItem({
      TableName: env.CACHE_TABLE_NAME,
      Key: {
        channel: channel
      }
    })
  ).Item;

export const saveChannelMetadata = async (
  channel: string,
  conversationId: string,
  messageId: string,
  dependencies: ChatDependencies,
  env: SlackEventsEnv
) =>
  await dependencies.putItem({
    TableName: env.CACHE_TABLE_NAME,
    Item: {
      channel,
      conversationId,
      messageId,
      latestTs: Date.now()
    }
  });

export const saveMessageMetadata = async (
  enterpriseQResponse: EnterpriseQResponse,
  dependencies: ChatDependencies,
  env: SlackEventsEnv
) =>
  await dependencies.putItem({
    TableName: env.MESSAGE_METADATA_TABLE_NAME,
    Item: {
      messageId: enterpriseQResponse.messageId,
      conversationId: enterpriseQResponse.conversationId,
      sourceAttribution: enterpriseQResponse.sourceAttribution,
      aiMessageId: enterpriseQResponse.aiMessageId,
      humanMessageId: enterpriseQResponse.humanMessageId,
      ts: Date.now()
    }
  });

export const getMessageMetadata = async (
  messageId: string,
  dependencies: ChatDependencies,
  env: SlackEventsEnv
) =>
  (
    await dependencies.getItem({
      TableName: env.MESSAGE_METADATA_TABLE_NAME,
      Key: {
        messageId
      }
    })
  ).Item;
