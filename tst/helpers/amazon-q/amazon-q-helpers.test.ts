import amazonQValidResponse1 from '@tst/mocks/amazon-q/valid-response-1.json';
import amazonQValidResponse2 from '@tst/mocks/amazon-q/valid-response-2.json';
import { MOCK_DEPENDENCIES, MOCK_ENV, MOCK_IAM_SESSION_CREDS } from '@tst/mocks/mocks';

import {
  chat,
  getResponseAsBlocks,
  getTable,
  getTablePrefix,
  hasTable,
  parseTable
} from '@helpers/amazon-q/amazon-q-helpers';
import { ChatSyncCommandOutput } from '@aws-sdk/client-qbusiness';

describe('AmazonQ helpers test', () => {
  test('Should get a response as block with context', async () => {
    const response = await chat('message', [], MOCK_DEPENDENCIES, MOCK_ENV, MOCK_IAM_SESSION_CREDS);
    expect(response).toEqual(amazonQValidResponse1);
  });

  test('Test response markdown conversion', async () => {
    const response = getResponseAsBlocks(amazonQValidResponse1 as ChatSyncCommandOutput);
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

    const response2 = getResponseAsBlocks(amazonQValidResponse2);
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
