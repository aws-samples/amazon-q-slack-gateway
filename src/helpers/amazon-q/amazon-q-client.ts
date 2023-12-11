import { SlackEventsEnv } from '@functions/slack-event-handler';
import { SlackInteractionsEnv } from '@functions/slack-interaction-handler';
import { makeLogger } from '@src/logging';
import { v4 as uuid } from 'uuid';
import {
  QBusinessClient,
  ChatSyncCommand,
  PutFeedbackCommand,
  PutFeedbackCommandInput,
  MessageUsefulnessReason,
  MessageUsefulness,
  PutFeedbackCommandOutput,
  ChatSyncCommandOutput,
  AttachmentInput
} from '@aws-sdk/client-qbusiness';

const logger = makeLogger('amazon-q-client');

let amazonQClient: QBusinessClient | null = null;

export const getClient = (env: SlackEventsEnv) => {
  if (amazonQClient === null) {
    logger.debug(`Initiating AmazonQ client with region ${env.AMAZON_Q_REGION}`);
    amazonQClient = new QBusinessClient({
      region: env.AMAZON_Q_REGION
    });
  }

  return amazonQClient;
};

export const callClient = async (
  message: string,
  attachments: AttachmentInput[],
  env: SlackEventsEnv,
  context?: {
    conversationId: string;
    parentMessageId: string;
  }
): Promise<ChatSyncCommandOutput> => {
  const input = {
    applicationId: env.AMAZON_Q_APP_ID,
    userId: env.AMAZON_Q_USER_ID,
    clientToken: uuid(),
    userMessage: message,
    ...(attachments.length > 0 && { attachments }),
    ...context
  };

  logger.debug(`callClient input ${JSON.stringify(input)}`);
  return await getClient(env).send(new ChatSyncCommand(input));
};

export const submitFeedbackRequest = async (
  env: SlackInteractionsEnv,
  context: {
    conversationId: string;
    messageId: string;
  },
  usefulness: MessageUsefulness,
  reason: MessageUsefulnessReason,
  submittedAt: string
): Promise<PutFeedbackCommandOutput> => {
  const input: PutFeedbackCommandInput = {
    applicationId: env.AMAZON_Q_APP_ID,
    userId: env.AMAZON_Q_USER_ID,
    ...context,
    messageUsefulness: {
      usefulness: usefulness,
      reason: reason,
      // Slack ts format E.g. 1702282895.883219
      submittedAt: new Date(Number(submittedAt) * 1000)
    }
  };

  logger.debug(`putFeedbackRequest input ${JSON.stringify(input)}`);
  const response = await getClient(env).send(new PutFeedbackCommand(input));
  logger.debug(`putFeedbackRequest output ${JSON.stringify(response)}`);

  return response;
};
