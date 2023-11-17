import { SlackEventsEnv } from '@functions/slack-event-handler';
import { createButton, getMarkdownBlocks, SLACK_ACTION } from '@helpers/slack/slack-helpers';
import { EnterpriseQResponse } from '@helpers/enterprise-q/enterprise-q-client';
import { makeLogger } from '@src/logging';
import { isEmpty } from '@src/utils';
import { ChatDependencies, ChatContextFile } from '@src/helpers/chat';
import { Block } from '@slack/web-api';

const logger = makeLogger('enterprise-q-helpers');

// Member must have length less than or equal to 7000
const ENTERPRISE_Q_MSG_LIMIT = 7000;
const WARN_TRUNCATED = `| Please note that you do not have all the conversation history due to limitation`;

export const chat = async (
  incomingMessage: string,
  chatContextFiles: ChatContextFile[],
  dependencies: ChatDependencies,
  env: SlackEventsEnv,
  context?: {
    conversationId: string;
    parentMessageId: string;
  }
): Promise<EnterpriseQResponse | Error> => {
  try {
    // I do not like this, but we have a hard limitation
    // I am wondering if the service will provide a way to inject a prompt as an individual parameter
    const inputMessage =
      incomingMessage.length > ENTERPRISE_Q_MSG_LIMIT
        ? incomingMessage.slice(
            incomingMessage.length + WARN_TRUNCATED.length - ENTERPRISE_Q_MSG_LIMIT
          ) + WARN_TRUNCATED
        : incomingMessage;

    const response = await dependencies.callClient(inputMessage, chatContextFiles, env, context);
    logger.debug(`EnterpriseQ chatSync response: ${JSON.stringify(response)}`);
    return response;
  } catch (error) {
    logger.error(`Caught Exception: ${JSON.stringify(error)}`);
    return new Error(`Caught Exception: ${JSON.stringify(error)}`);
  }
};

export const getResponseAsBlocks = (response: EnterpriseQResponse) => {
  if (isEmpty(response.systemMessage)) {
    return [];
  }

  const content = response.systemMessage;

  return [
    ...(!hasTable(content)
      ? getMarkdownBlocks(convertHN(content))
      : getMarkdownBlocks(
          `${convertHN(getTablePrefix(content))}\n\n${parseTable(getTable(content))}`
        )),
    ...(!isEmpty(response.sourceAttributions)
      ? [createButton('View source(s)', response.systemMessageId)]
      : [])
  ];
};

export const getFeedbackBlocks = (response: EnterpriseQResponse): Block[] => [
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
