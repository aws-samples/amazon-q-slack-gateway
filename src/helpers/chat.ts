import { SlackEventsEnv } from '@functions/slack-event-handler';
import { Block } from '@slack/web-api';
import {
  AmazonQResponse,
  callClient,
  submitFeedbackRequest
} from '@helpers/amazon-q/amazon-q-client';
import { deleteItem, getItem, putItem } from '@helpers/dynamodb-client';
import {
  getUserInfo,
  retrieveThreadHistory,
  retrieveAttachment,
  sendSlackMessage,
  updateSlackMessage
} from '@helpers/slack/slack-helpers';
import { getFeedbackBlocks, getResponseAsBlocks } from '@helpers/amazon-q/amazon-q-helpers';

export interface ChatResponse {
  systemMessage: string;
}

export const chatDependencies = {
  callClient,
  submitFeedbackRequest,
  deleteItem,
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
  attachments: Attachment[],
  env: SlackEventsEnv,
  context?: { conversationId: string; parentMessageId: string }
) => ChatResponse;

export interface Attachment {
  name: string;
  data: Buffer;
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

export const deleteChannelMetadata = async (
  channel: string,
  dependencies: ChatDependencies,
  env: SlackEventsEnv
) =>
  await dependencies.deleteItem({
    TableName: env.CACHE_TABLE_NAME,
    Key: {
      channel
    }
  });

const expireAt = (env: SlackEventsEnv) => {
  const contextTTL = Number(env.CONTEXT_DAYS_TO_LIVE) * 24 * 60 * 60 * 1000; // milliseconds
  return Math.floor((Date.now() + contextTTL) / 1000); // Unix time (seconds);
};

export const saveChannelMetadata = async (
  channel: string,
  conversationId: string,
  systemMessageId: string,
  dependencies: ChatDependencies,
  env: SlackEventsEnv
) => {
  await dependencies.putItem({
    TableName: env.CACHE_TABLE_NAME,
    Item: {
      channel,
      conversationId,
      systemMessageId,
      latestTs: Date.now(),
      expireAt: expireAt(env)
    }
  });
};

export const saveMessageMetadata = async (
  amazonQResponse: AmazonQResponse,
  dependencies: ChatDependencies,
  env: SlackEventsEnv
) => {
  await dependencies.putItem({
    TableName: env.MESSAGE_METADATA_TABLE_NAME,
    Item: {
      messageId: amazonQResponse.systemMessageId,
      conversationId: amazonQResponse.conversationId,
      sourceAttributions: amazonQResponse.sourceAttributions,
      systemMessageId: amazonQResponse.systemMessageId,
      userMessageId: amazonQResponse.userMessageId,
      ts: Date.now(),
      expireAt: expireAt(env)
    }
  });
};

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
