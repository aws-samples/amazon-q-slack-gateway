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
  retrieveAttachment,
  sendSlackMessage,
  updateSlackMessage
} from '@helpers/slack/slack-helpers';
import { getFeedbackBlocks, getResponseAsBlocks } from '@helpers/enterprise-q/enterprise-q-helpers';

export interface ChatResponse {
  systemMessage: string;
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
  retrieveAttachment,
  getUserInfo
};

export type ChatDependencies = typeof chatDependencies;

export type callClient = (
  message: string,
  chatContextFiles: ChatContextFile[],
  env: SlackEventsEnv,
  context?: { conversationId: string; parentMessageId: string }
) => ChatResponse;

export interface ChatContextFile {
  name: string,
  data: string,
}

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
  systemMessageId: string,
  dependencies: ChatDependencies,
  env: SlackEventsEnv
) => {
  const contextTTL = Number(env.CONTEXT_DAYS_TO_LIVE) * 24 * 60 * 60 * 1000; // milliseconds
  const expireAt = Math.floor((Date.now() + contextTTL) / 1000); // Unix time (seconds)
  await dependencies.putItem({
    TableName: env.CACHE_TABLE_NAME,
    Item: {
      channel,
      conversationId,
      systemMessageId,
      latestTs: Date.now(),
      expireAt: expireAt
    }
  });
}

export const saveMessageMetadata = async (
  enterpriseQResponse: EnterpriseQResponse,
  dependencies: ChatDependencies,
  env: SlackEventsEnv
) => {
  const contextTTL = Number(env.CONTEXT_DAYS_TO_LIVE) * 24 * 60 * 60 * 1000; // milliseconds
  const expireAt = Math.floor((Date.now() + contextTTL) / 1000); // Unix time (seconds)
  await dependencies.putItem({
    TableName: env.MESSAGE_METADATA_TABLE_NAME,
    Item: {
      messageId: enterpriseQResponse.systemMessageId,
      conversationId: enterpriseQResponse.conversationId,
      sourceAttributions: enterpriseQResponse.sourceAttributions,
      systemMessageId: enterpriseQResponse.systemMessageId,
      userMessageId: enterpriseQResponse.userMessageId,
      ts: Date.now(),
      expireAt: expireAt
    }
  });
}

export const getMessageMetadata = async (
  systemMessageId: string,
  dependencies: ChatDependencies,
  env: SlackEventsEnv
) =>
  (
    await dependencies.getItem({
      TableName: env.MESSAGE_METADATA_TABLE_NAME,
      Key: {
        messageId: systemMessageId
      }
    })
  ).Item;
