import { handler } from '@functions/slack-event-handler';
import amazonQValidResponse2TextSimple from '@tst/mocks/amazon-q/valid-response-2.json';
import { MOCK_AWS_RESPONSE, MOCK_DEPENDENCIES, MOCK_ENV } from '@tst/mocks/mocks';
import { Callback, Context } from 'aws-lambda';
import { ChatSyncCommandOutput } from '@aws-sdk/client-qbusiness';

/* eslint @typescript-eslint/no-explicit-any: "off" */

describe('Slack event handler test', () => {
  test('Should return status code 400 for empty body', async () => {
    const response = await handler(
      {
        headers: {},
        body: ''
      },
      {} as Context,
      {} as Callback,
      MOCK_DEPENDENCIES,
      MOCK_ENV
    );

    expect(response.statusCode).toEqual(400);
  });

  test('Should return status code 403 for invalid signature', async () => {
    const response = await handler(
      {
        headers: {},
        body: 'not null'
      },
      {} as Context,
      {} as Callback,
      {
        ...MOCK_DEPENDENCIES,
        validateSlackRequest: () => Promise.resolve(false)
      },
      MOCK_ENV
    );

    expect(response.statusCode).toEqual(403);
  });

  test('Should return challenge in body', async () => {
    const response = await handler(
      {
        headers: {},
        body: JSON.stringify({
          challenge: 'challenge'
        })
      },
      {} as Context,
      {} as Callback,
      MOCK_DEPENDENCIES,
      MOCK_ENV
    );

    expect(response.statusCode).toEqual(200);
    expect(response.body).toEqual('challenge');
  });

  test('Should ignore slack retries', async () => {
    const response = await handler(
      {
        headers: {
          'X-Slack-Retry-Reason': 'test',
          'X-Slack-Retry-Num': String(1)
        },
        body: JSON.stringify({})
      },
      {} as Context,
      {} as Callback,
      MOCK_DEPENDENCIES,
      MOCK_ENV
    );

    expect(response.statusCode).toEqual(200);
    expect(JSON.parse(response.body).error).toBeDefined();
  });

  test('Should ignore unsupported events', async () => {
    const response = await handler(
      {
        headers: {},
        body: JSON.stringify({
          event: {
            type: 'unsupported'
          }
        })
      },
      {} as Context,
      {} as Callback,
      MOCK_DEPENDENCIES,
      MOCK_ENV
    );

    expect(response.statusCode).toEqual(200);
    expect(JSON.parse(response.body).error).toBeDefined();
  });

  test('Should ignore undefined channel', async () => {
    const response = await handler(
      {
        headers: {},
        body: JSON.stringify({
          event: {
            type: 'message'
          }
        })
      },
      {} as Context,
      {} as Callback,
      MOCK_DEPENDENCIES,
      MOCK_ENV
    );

    expect(response.statusCode).toEqual(200);
    expect(JSON.parse(response.body).error).toBeDefined();
  });

  test('Should chat without context', async () => {
    const response = await handler(
      {
        headers: {},
        body: JSON.stringify({
          event: {
            type: 'message',
            channel: 'channel',
            client_msg_id: 'client_msg_id',
            text: 'text'
          }
        })
      },
      {} as Context,
      {} as Callback,
      MOCK_DEPENDENCIES,
      MOCK_ENV
    );

    const b = JSON.parse(response.body);
    expect(response.statusCode).toEqual(200);
    expect(b.error).toBeUndefined();
    expect(b.chat).toBeDefined();
    expect(b.chat.context.conversationId).toBeUndefined();
    expect(b.chat.context.parentMessageId).toBeUndefined();
    expect(b.chat.output.conversationId).toBeDefined();
  });

  test('Should chat with context table', async () => {
    const response = await handler(
      {
        headers: {},
        body: JSON.stringify({
          event: {
            type: 'message',
            channel: 'channel',
            client_msg_id: 'client_msg_id',
            text: 'text'
          }
        })
      },
      {} as Context,
      {} as Callback,
      {
        ...MOCK_DEPENDENCIES,
        getItem: async () =>
          Promise.resolve({
            Item: {
              conversationId: 'conversationId',
              parentMessageId: 'parentMessageId'
            },
            ...MOCK_AWS_RESPONSE
          })
      },
      MOCK_ENV
    );

    const b = JSON.parse(response.body);
    expect(response.statusCode).toEqual(200);
    expect(b.error).toBeUndefined();
    expect(b.chat).toBeDefined();
    expect(b.chat.context.conversationId).toEqual('conversationId');
    expect(b.chat.output.conversationId).toBeDefined();
    expect(b.chat.blocks).toBeDefined();
  });

  test('Should chat with context simple text', async () => {
    const response = await handler(
      {
        headers: {},
        body: JSON.stringify({
          event: {
            type: 'message',
            channel: 'channel',
            client_msg_id: 'client_msg_id',
            text: 'text'
          }
        })
      },
      {} as Context,
      {} as Callback,
      {
        ...MOCK_DEPENDENCIES,
        callClient: () => Promise.resolve(amazonQValidResponse2TextSimple as ChatSyncCommandOutput),
        getItem: async () =>
          Promise.resolve({
            Item: {
              conversationId: 'conversationId',
              parentMessageId: 'parentMessageId'
            },
            ...MOCK_AWS_RESPONSE
          })
      },
      MOCK_ENV
    );

    const b = JSON.parse(response.body);
    expect(response.statusCode).toEqual(200);
    expect(b.error).toBeUndefined();
    expect(b.chat).toBeDefined();
    expect(b.chat.context.conversationId).toEqual('conversationId');
    expect(b.chat.output.conversationId).toBeDefined();
    expect(b.chat.blocks).toEqual([
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'This is a simple text\n and now with a \n*header*\n*another header*'
        }
      },
      {
        type: 'actions',
        block_id: `feedback-${amazonQValidResponse2TextSimple.conversationId}-${amazonQValidResponse2TextSimple.systemMessageId}`,
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              emoji: true,
              text: ':thumbsup:'
            },
            style: 'primary',
            action_id: 'FEEDBACK_UP',
            value: amazonQValidResponse2TextSimple.systemMessageId
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              emoji: true,
              text: ':thumbsdown:'
            },
            style: 'danger',
            action_id: 'FEEDBACK_DOWN',
            value: amazonQValidResponse2TextSimple.systemMessageId
          }
        ]
      }
    ]);
  });

  test('Should chat and return an error', async () => {
    const response = await handler(
      {
        headers: {},
        body: JSON.stringify({
          event: {
            type: 'message',
            channel: 'channel',
            client_msg_id: 'client_msg_id',
            text: 'text'
          }
        })
      },
      {} as Context,
      {} as Callback,
      {
        ...MOCK_DEPENDENCIES,
        callClient: () => Promise.reject('Error'),
        getItem: async () =>
          Promise.resolve({
            Item: {
              conversationId: 'conversationId',
              parentMessageId: 'parentMessageId'
            },
            ...MOCK_AWS_RESPONSE
          })
      },
      MOCK_ENV
    );

    const b = JSON.parse(response.body);
    expect(response.statusCode).toEqual(200);
    expect(b.error).toBeDefined();
    expect(b.chat).toBeDefined();
    expect(b.chat.context.conversationId).toEqual('conversationId');
    expect(b.chat.blocks).toBeDefined();
  });

  test('Should chat from app mention', async () => {
    const response = await handler(
      {
        headers: {},
        body: JSON.stringify({
          event: {
            client_msg_id: 'b0b6e027-2d47-453a-84bc-d947ae7defca',
            type: 'app_mention',
            text: '<@U05R8PST0H5> more',
            user: 'U043ZH2AG95',
            ts: '1698647717.575619',
            blocks: [
              {
                type: 'rich_text',
                block_id: 'zoDXg',
                elements: [
                  {
                    type: 'rich_text_section',
                    elements: [
                      {
                        type: 'user',
                        user_id: 'U05R8PST0H5'
                      },
                      {
                        type: 'text',
                        text: ' more'
                      }
                    ]
                  }
                ]
              }
            ],
            team: 'T044E46HKJ6',
            thread_ts: '1698647610.418749',
            parent_user_id: 'U043ZH2AG95',
            channel: 'C05URD5PT43',
            event_ts: '1698647717.575619'
          }
        })
      },
      {} as Context,
      {} as Callback,
      {
        ...MOCK_DEPENDENCIES,
        retrieveThreadHistory: () =>
          Promise.resolve({
            ok: true,
            messages: [
              {
                type: 'message',
                user: 'U123ABC456',
                text: 'I find you punny and would like to smell your nose letter',
                ts: '1512085950.000216'
              },
              {
                type: 'message',
                user: 'U222BBB222',
                text: 'What, you want to smell my shoes better?',
                ts: '1512104434.000490'
              }
            ],
            has_more: true,
            pin_count: 0,
            response_metadata: {
              next_cursor: 'bmV4dF90czoxNTEyMDg1ODYxMDAwNTQz'
            }
          }),
        callClient: () => Promise.resolve(amazonQValidResponse2TextSimple),
        getItem: async () =>
          Promise.resolve({
            Item: {
              conversationId: 'conversationId',
              parentMessageId: 'parentMessageId'
            },
            ...MOCK_AWS_RESPONSE
          })
      },
      MOCK_ENV
    );

    const b = JSON.parse(response.body);
    expect(response.statusCode).toEqual(200);
    expect(b.chat).toEqual({
      context: {},
      prompt:
        'Given the following conversation thread history in JSON:\n[{"name":"Gregory Spengler","message":"I find you punny and would like to smell your nose letter","date":"2017-11-30T23:52:30.000Z"}]\n----------\nmore',
      output: {
        systemMessage: 'This is a simple text\n and now with a \n### header\n# another header',
        conversationId: '80a6642c-8b3d-433e-a9cb-233b42a0d63a',
        sourceAttributions: [],
        systemMessageId: 'e5a23752-3f31-4fee-83fe-56fbd7803540',
        userMessageId: '616fefbc-48bc-442d-a618-497bbbde3d66',
        $metadata: {}
      },
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'This is a simple text\n and now with a \n*header*\n*another header*'
          }
        },
        {
          type: 'actions',
          block_id:
            'feedback-80a6642c-8b3d-433e-a9cb-233b42a0d63a-e5a23752-3f31-4fee-83fe-56fbd7803540',
          elements: [
            {
              type: 'button',
              text: {
                type: 'plain_text',
                emoji: true,
                text: ':thumbsup:'
              },
              style: 'primary',
              action_id: 'FEEDBACK_UP',
              value: 'e5a23752-3f31-4fee-83fe-56fbd7803540'
            },
            {
              type: 'button',
              text: {
                type: 'plain_text',
                emoji: true,
                text: ':thumbsdown:'
              },
              style: 'danger',
              action_id: 'FEEDBACK_DOWN',
              value: 'e5a23752-3f31-4fee-83fe-56fbd7803540'
            }
          ]
        }
      ]
    });
  });
});
