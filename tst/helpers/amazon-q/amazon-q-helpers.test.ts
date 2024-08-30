import amazonQValidResponse1 from '@tst/mocks/amazon-q/valid-response-1.json';
import amazonQValidResponse2 from '@tst/mocks/amazon-q/valid-response-2.json';
import { amazonQValidStreamResponse1, amazonQValidStreamResponse2 } from '@tst/mocks/amazon-q/valid-stream-responses';
import { MOCK_DEPENDENCIES } from '@tst/mocks/mocks';
import { SourceAttribution, TextOutputEvent } from '@aws-sdk/client-qbusiness';

import {
  getResponseAsBlocks,
  getTable,
  getTablePrefix,
  hasTable,
  parseTable
} from '@helpers/amazon-q/amazon-q-helpers';
import { ChatSyncCommandOutput } from '@aws-sdk/client-qbusiness';

describe('AmazonQ helpers test', () => {
  test('Should get a response as block with context', async () => {
    const response = await MOCK_DEPENDENCIES.callChatSyncCommand();
    expect(response).toEqual(amazonQValidResponse1);
  });

  test('Test response markdown conversion', async () => {
    const amazonQReponse = amazonQValidResponse1 as ChatSyncCommandOutput
    const response = getResponseAsBlocks(amazonQReponse.systemMessage ?? '', amazonQReponse.systemMessageId ?? '', amazonQReponse.sourceAttributions ?? []);
    expect(response).toEqual([
      {
        text: {
          text: '*The Pillars of the Well Architected Framework*\n\n*Name:* Operational Excellence\n*Description:* The ability to run and monitor systems to deliver business value and to continually improve supporting processes and procedures.\n*Name:* Security\n*Description:* The ability to protect information, systems, and assets while delivering business value through risk assessments and mitigation strategies.\n*Name:* Reliability\n*Description:* The ability of a system to recover from infrastructure or service disruptions, dynamically acquire computing resources to meet demand, and mitigate disruptions such as misconfigurations or transient network issues.\n*Name:* Performance Efficiency\n*Description:* The ability to use computing resources efficiently to meet system requirements, and to maintain that efficiency as demand changes and technologies evolve.\n*Name:* Cost Optimization\n*Description:* The ability to run systems to deliver business value at the lowest price point.\n',
          type: 'mrkdwn'
        },
        type: 'section'
      },
      {
        elements: [
          {
            action_id: 'VIEW_SOURCES',
            style: 'primary',
            text: {
              emoji: true,
              text: 'View source(s)',
              type: 'plain_text'
            },
            type: 'button',
            value: 'e5a23752-3f31-4fee-83fe-56fbd7803540'
          }
        ],
        type: 'actions'
      }
    ]);
    const amazonQReponse2 = amazonQValidResponse2 as ChatSyncCommandOutput
    const response2 = getResponseAsBlocks(amazonQReponse2.systemMessage ?? '', amazonQReponse2.systemMessageId ?? '', amazonQReponse2.sourceAttributions ?? []);
    expect(response2).toEqual([
      {
        text: {
          text: 'This is a simple text\n and now with a \n*header*\n*another header*',
          type: 'mrkdwn'
        },
        type: 'section'
      }
    ]);
  });

  test('Test table markdown', async () => {
    const prefix = getTablePrefix(amazonQValidResponse1.systemMessage);
    expect(hasTable(amazonQValidResponse1.systemMessage)).toBeTruthy();

    const table = getTable(amazonQValidResponse1.systemMessage);
    const parsedTable = parseTable(table);

    expect(prefix).toEqual('# The Pillars of the Well Architected Framework');
    expect(table).toEqual(
      '|Name | Description|\n|:--|:--| \n|Operational Excellence| The ability to run and monitor systems to deliver business value and to continually improve supporting processes and procedures.|\n|Security|The ability to protect information, systems, and assets while delivering business value through risk assessments and mitigation strategies.| \n|Reliability| The ability of a system to recover from infrastructure or service disruptions, dynamically acquire computing resources to meet demand, and mitigate disruptions such as misconfigurations or transient network issues.|\n|Performance Efficiency| The ability to use computing resources efficiently to meet system requirements, and to maintain that efficiency as demand changes and technologies evolve.|\n|Cost Optimization| The ability to run systems to deliver business value at the lowest price point.|'
    );
    expect(parsedTable).toEqual(
      '*Name:* Operational Excellence\n' +
        '*Description:* The ability to run and monitor systems to deliver business value and to continually improve supporting processes and procedures.\n' +
        '*Name:* Security\n' +
        '*Description:* The ability to protect information, systems, and assets while delivering business value through risk assessments and mitigation strategies.\n' +
        '*Name:* Reliability\n' +
        '*Description:* The ability of a system to recover from infrastructure or service disruptions, dynamically acquire computing resources to meet demand, and mitigate disruptions such as misconfigurations or transient network issues.\n' +
        '*Name:* Performance Efficiency\n' +
        '*Description:* The ability to use computing resources efficiently to meet system requirements, and to maintain that efficiency as demand changes and technologies evolve.\n' +
        '*Name:* Cost Optimization\n' +
        '*Description:* The ability to run systems to deliver business value at the lowest price point.\n'
    );
  });
});

describe('AmazonQ helpers test (chatStream)', () => {
  test('Should get a response as block with context', async () => {
    const response = await MOCK_DEPENDENCIES.callChatCommand();
    expect(response).toEqual(amazonQValidStreamResponse1);
  });

  test('Test response markdown conversion', async () => {
    let messageId1 = '';
    let content1 = '';
    let sourceAttributions1: SourceAttribution[] = [];
    for await (const event of amazonQValidStreamResponse1.outputStream) {
      if (event.metadataEvent)
        sourceAttributions1 = event.metadataEvent.sourceAttributions
      else if (event.textEvent) {
        messageId1 = event.textEvent.systemMessageId
        content1 = event.textEvent.systemMessage
      }
    } 
    const formattedResponse1 = getResponseAsBlocks(content1, messageId1, sourceAttributions1)

    expect(formattedResponse1).toEqual([
      {
        text: {
          text: '*The Pillars of the Well Architected Framework*\n\n*Name:* Operational Excellence\n*Description:* The ability to run and monitor systems to deliver business value and to continually improve supporting processes and procedures.\n*Name:* Security\n*Description:* The ability to protect information, systems, and assets while delivering business value through risk assessments and mitigation strategies.\n*Name:* Reliability\n*Description:* The ability of a system to recover from infrastructure or service disruptions, dynamically acquire computing resources to meet demand, and mitigate disruptions such as misconfigurations or transient network issues.\n*Name:* Performance Efficiency\n*Description:* The ability to use computing resources efficiently to meet system requirements, and to maintain that efficiency as demand changes and technologies evolve.\n*Name:* Cost Optimization\n*Description:* The ability to run systems to deliver business value at the lowest price point.\n',
          type: 'mrkdwn'
        },
        type: 'section'
      },
      {
        elements: [
          {
            action_id: 'VIEW_SOURCES',
            style: 'primary',
            text: {
              emoji: true,
              text: 'View source(s)',
              type: 'plain_text'
            },
            type: 'button',
            value: 'e5a23752-3f31-4fee-83fe-56fbd7803540'
          }
        ],
        type: 'actions'
      }
    ]);

    let messageId2 = '';
    let content2 = '';
    let sourceAttributions2: SourceAttribution[] = [];
    for await (const event of amazonQValidStreamResponse2.outputStream) {
      if (event.metadataEvent)
        sourceAttributions2 = event.metadataEvent.sourceAttributions
      else if (event.textEvent) {
        messageId2 = event.textEvent.systemMessageId
        content2 = event.textEvent.systemMessage
      }
    } 
    const formattedResponse2 = getResponseAsBlocks(content2, messageId2, sourceAttributions2)
    expect(formattedResponse2).toEqual([
      {
        text: {
          text: 'This is a simple text\n and now with a \n*header*\n*another header*',
          type: 'mrkdwn'
        },
        type: 'section'
      }
    ]);
  });

  test('Test table markdown', async () => {
    let textEvent: TextOutputEvent | undefined;
    for await (const event of amazonQValidStreamResponse1.outputStream) {
      if (event.textEvent) {
        textEvent = event.textEvent;
      }
    }
    expect(textEvent).toBeDefined();
    expect(textEvent!.systemMessage).toBeDefined();
    if (textEvent && textEvent.systemMessage) {
      const prefix = getTablePrefix(textEvent.systemMessage);
      expect(hasTable(textEvent.systemMessage)).toBeTruthy();

      const table = getTable(textEvent.systemMessage);
      const parsedTable = parseTable(table);

      expect(prefix).toEqual('# The Pillars of the Well Architected Framework');
      expect(table).toEqual(
        '|Name | Description|\n|:--|:--| \n|Operational Excellence| The ability to run and monitor systems to deliver business value and to continually improve supporting processes and procedures.|\n|Security|The ability to protect information, systems, and assets while delivering business value through risk assessments and mitigation strategies.| \n|Reliability| The ability of a system to recover from infrastructure or service disruptions, dynamically acquire computing resources to meet demand, and mitigate disruptions such as misconfigurations or transient network issues.|\n|Performance Efficiency| The ability to use computing resources efficiently to meet system requirements, and to maintain that efficiency as demand changes and technologies evolve.|\n|Cost Optimization| The ability to run systems to deliver business value at the lowest price point.|'
      );
      expect(parsedTable).toEqual(
        '*Name:* Operational Excellence\n' +
          '*Description:* The ability to run and monitor systems to deliver business value and to continually improve supporting processes and procedures.\n' +
          '*Name:* Security\n' +
          '*Description:* The ability to protect information, systems, and assets while delivering business value through risk assessments and mitigation strategies.\n' +
          '*Name:* Reliability\n' +
          '*Description:* The ability of a system to recover from infrastructure or service disruptions, dynamically acquire computing resources to meet demand, and mitigate disruptions such as misconfigurations or transient network issues.\n' +
          '*Name:* Performance Efficiency\n' +
          '*Description:* The ability to use computing resources efficiently to meet system requirements, and to maintain that efficiency as demand changes and technologies evolve.\n' +
          '*Name:* Cost Optimization\n' +
          '*Description:* The ability to run systems to deliver business value at the lowest price point.\n'
      );}});
});