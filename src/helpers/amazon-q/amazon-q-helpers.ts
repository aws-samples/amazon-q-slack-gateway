import { createButton, getMarkdownBlocks, SLACK_ACTION } from '@helpers/slack/slack-helpers';
import { makeLogger } from '@src/logging';
import { isEmpty } from '@src/utils';
import { Block } from '@slack/web-api';
import { ChatSyncCommandOutput, ChatCommandOutput, SourceAttribution, MetadataEvent, AttachmentInput } from '@aws-sdk/client-qbusiness';
import { ExpiredTokenException } from '@aws-sdk/client-sso-oidc';
import { sendChatSyncCommand, sendChatCommand } from './amazon-q-client';
import { Credentials } from 'aws-sdk';
import { SlackEventsEnv } from '@src/functions/slack-event-handler';
const logger = makeLogger('amazon-q-helpers');


const AMAZON_Q_MSG_LIMIT = 7000;
const WARN_TRUNCATED = `| Please note that you do not have all the conversation history due to limitation`;

const truncateMessageIfNeeded = (message: string): string => {
  return message.length > AMAZON_Q_MSG_LIMIT
    ? message.slice(message.length + WARN_TRUNCATED.length - AMAZON_Q_MSG_LIMIT) + WARN_TRUNCATED
    : message;
};

const handleError = (error: unknown): Error => {
  logger.error(`Caught Exception: ${JSON.stringify(error)}`);
  if (error instanceof Error) {
    logger.debug(error.stack);
    if (error instanceof ExpiredTokenException) {
      logger.error(`Token expired: ${error.message}`);
    }
    return new Error(error.message);
  } else {
    return new Error(`${JSON.stringify(error)}`);
  }
};

export const callChatSyncCommand = async (
  slackUserId: string,
  message: string,
  attachments: AttachmentInput[],
  env: SlackEventsEnv,
  iamSessionCreds: Credentials,
  context?: {
    conversationId: string;
    parentMessageId: string;
  }
): Promise<ChatSyncCommandOutput | Error> => {
  try {
    message = truncateMessageIfNeeded(message);
    const response = await sendChatSyncCommand(
      slackUserId,
      message,
      attachments,
      env,
      iamSessionCreds,
      context
    )
    return response;
  } catch (error) {
    return handleError(error);
  }
}

export const callChatCommand = async (
  slackUserId: string,
  message: string,
  attachments: AttachmentInput[],
  env: SlackEventsEnv,
  iamSessionCreds: Credentials,
  context?: {
    conversationId: string;
    parentMessageId: string;
  }
): Promise<ChatCommandOutput | Error> => {
  try {
    message = truncateMessageIfNeeded(message);
    const response = await sendChatCommand(
      slackUserId,
      message,
      attachments,
      env,
      iamSessionCreds,
      context
    )
    return response;
  } catch (error) {
    return handleError(error);
  }
}

export const getResponseAsBlocks = (content: string, systemMessageId: string, sourceAttributions: SourceAttribution[]) => {
  if (isEmpty(content)) {
    return [];
  }

  return [
    ...(!hasTable(content)
      ? getMarkdownBlocks(convertHN(content))
      : getMarkdownBlocks(
          `${convertHN(getTablePrefix(content))}\n\n${parseTable(getTable(content))}`
        )),
    ...(!isEmpty(sourceAttributions)
      ? [createButton('View source(s)', systemMessageId ?? '')]
      : [])
  ];
};


export const getFeedbackBlocks = (response: ChatSyncCommandOutput | MetadataEvent): Block[] => [
  {
    type: 'actions',
    block_id: `feedback-${response.conversationId}-${response.systemMessageId}`,
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          emoji: true,
          text: ':thumbsup:'
        },
        style: 'primary',
        action_id: SLACK_ACTION[SLACK_ACTION.FEEDBACK_UP],
        value: response.systemMessageId
      },
      {
        type: 'button',
        text: {
          type: 'plain_text',
          emoji: true,
          text: ':thumbsdown:'
        },
        style: 'danger',
        action_id: SLACK_ACTION[SLACK_ACTION.FEEDBACK_DOWN],
        value: response.systemMessageId
      }
    ]
  } as Block
];

export const getSignInBlocks = (authorizationURL: string): Block[] => [
  {
    type: 'actions',
    block_id: `sign-in`,
    elements: [
      {
        type: 'button',
        text: {
          type: 'plain_text',
          emoji: true,
          text: 'Sign in to Amazon Q'
        },
        style: 'primary',
        action_id: SLACK_ACTION[SLACK_ACTION.SIGN_IN],
        url: authorizationURL
      }
    ]
  } as Block
];
/**
 * I am not very happy about the following lines, but it is being covered by unit testing
 * I did not find any libraries that would parse a Markdown table to a slack block kit
 */

export const getTablePrefix = (content: string) =>
  content.substring(0, content.indexOf('|')).trim();
export const hasTable = (content: string) =>
  content.indexOf('|') >= 0 && content.split('|').find((l) => isHeaderDelimiter(l)) !== undefined;
export const isHeaderDelimiter = (line: string) =>
  line === ':--' || line === ':-:' || line === '--:' || line === '---' || line === '-';

export const getTable = (content: string) =>
  content.indexOf('|') >= 0 && content.split('|').length > 4
    ? content.substring(content.indexOf('|'), content.lastIndexOf('|') + 1)
    : '';

export const parseTable = (table: string) => {
  const getRow = (row: string) =>
    row
      .split('|')
      .filter((e) => !isEmpty(e.trim()))
      .map((e) => e.trim());

  const t = table.split('\n');
  const header = t[0];
  const columnNames = getRow(header);
  const content = t.slice(2, t.length);

  const textElements = [];
  for (const row of content.map((e) => getRow(e))) {
    for (let i = 0; i < row.length; i++) {
      textElements.push(`*${columnNames[i]}:* ${row[i]}\n`);
    }
  }

  return textElements.join('');
};

export const isHN = (line: string) => line.startsWith('#');
export const removeHN = (line: string) =>
  line.substring(line.lastIndexOf('#') + 1, line.length).trim();

export const convertHN = (linesAsString: string) =>
  linesAsString
    .split('\n')
    .map((l) => (isHN(l) ? `*${removeHN(l)}*` : l))
    .join('\n');
