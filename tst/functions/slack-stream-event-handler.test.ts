import { ChatCommandOutput } from '@aws-sdk/client-qbusiness';
import { handler } from '@functions/slack-stream-event-handler';
import { updateSlackMessage } from '@src/helpers/slack/slack-helpers';
import { amazonQValidStreamResponse2 } from '@tst/mocks/amazon-q/valid-stream-responses';
import { MOCK_AWS_RESPONSE, MOCK_DEPENDENCIES, MOCK_ENV } from '@tst/mocks/mocks';
import { Callback, Context } from 'aws-lambda';

/* eslint @typescript-eslint/no-explicit-any: "off" */

describe('Slack event handler test', () => {
    test('Should handle error in updateSlackMessage', async () => {
        const mockDependencies = {
          ...MOCK_DEPENDENCIES,
          updateSlackMessage: jest.fn().mockRejectedValueOnce(new Error('Mocked updateSlackMessage error')),
        };
      
        const eventPayload = {
          headers: {},
          body: JSON.stringify({
            event: {
              type: 'message',
              channel: 'channel',
              client_msg_id: 'client_msg_id',
              text: 'text',
              user: 'user',
            },
          }),
        };
      
        const response = await handler(
          eventPayload,
          {} as Context,
          {} as Callback,
          mockDependencies,
          MOCK_ENV
        );
      
        const b = JSON.parse(response.body);
        expect(response.statusCode).toEqual(200);
        expect(mockDependencies.updateSlackMessage).toHaveBeenCalled();
        expect(b.chat.blocks).toBeDefined();
        expect(b.chat.blocks[0].text.text).toContain('Mocked updateSlackMessage error');
      });
      
      

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
            text: 'text',
            user: 'user'
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
    expect(b.chat.output.systemMessageId).toBeDefined();
    expect(b.chat.output.outputText).toBeDefined();
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
            text: 'text',
            user: 'user'
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
          }),
        callChatCommand: () => Promise.resolve({...amazonQValidStreamResponse2 as ChatCommandOutput})
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
    expect(b.chat.prompt).toBe('text');
    expect(b.chat.output.conversationId).toBe('91a6642c-8b3d-433e-a9cb-233b42a0d63b');
    expect(b.chat.output.systemMessageId).toBe('f5a23752-3f31-4fee-83fe-56fbd7803541');
    expect(b.chat.output.outputText).toBe('This is a simple text\n and now with a \n*header*\n*another header*');
    expect(b.chat.output.outputStream).toEqual([
      {
        metadataEvent: {
          conversationId: "91a6642c-8b3d-433e-a9cb-233b42a0d63b",
          finalTextMessage: "Simple Text with Header",
          sourceAttributions: [],
          systemMessageId: "f5a23752-3f31-4fee-83fe-56fbd7803541",
          userMessageId: "726fefbc-48bc-442d-a618-497bbbde3d67"
        }
      },
      {
        textEvent: {
          conversationId: "91a6642c-8b3d-433e-a9cb-233b42a0d63b",
          systemMessage: "This is a simple text\n and now with a \n*header*\n*another header*",
          systemMessageId: "f5a23752-3f31-4fee-83fe-56fbd7803541",
          userMessageId: "726fefbc-48bc-442d-a618-497bbbde3d67"
        }
      }
    ]);
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
            text: 'text',
            user: 'user'
          }
        })
      },
      {} as Context,
      {} as Callback,
      {
        ...MOCK_DEPENDENCIES,
        callChatCommand: () => Promise.resolve({...amazonQValidStreamResponse2 as ChatCommandOutput}),
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
    expect(b.chat.output.conversationId).toBe('91a6642c-8b3d-433e-a9cb-233b42a0d63b');
    expect(b.chat.output.systemMessageId).toBe('f5a23752-3f31-4fee-83fe-56fbd7803541');
    expect(b.chat.output.outputText).toBe('This is a simple text\n and now with a \n*header*\n*another header*');  
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
        block_id: `feedback-91a6642c-8b3d-433e-a9cb-233b42a0d63b-f5a23752-3f31-4fee-83fe-56fbd7803541`,
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
            value: 'f5a23752-3f31-4fee-83fe-56fbd7803541'
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
            value: 'f5a23752-3f31-4fee-83fe-56fbd7803541'
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
            text: 'text',
            user: 'user'
          }
        })
      },
      {} as Context,
      {} as Callback,
      {
        ...MOCK_DEPENDENCIES,
        callChatCommand: () => Promise.resolve(new Error('Mocked sendChatCommand error')),
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
        callChatCommand: () => Promise.resolve({
          $metadata: {},
          outputStream: {
            [Symbol.asyncIterator]: async function* () {
              yield {
                metadataEvent: {
                  conversationId: "80a6642c-8b3d-433e-a9cb-233b42a0d63a",
                  finalTextMessage: "This is a simple text",
                  sourceAttributions: [],
                  systemMessageId: "e5a23752-3f31-4fee-83fe-56fbd7803540",
                  userMessageId: "616fefbc-48bc-442d-a618-497bbbde3d66"
                }
              };
              yield {
                textEvent: {
                  conversationId: "80a6642c-8b3d-433e-a9cb-233b42a0d63a",
                  systemMessage: "This is a simple text\n and now with a \n*header*\n*another header*",
                  systemMessageId: "e5a23752-3f31-4fee-83fe-56fbd7803540",
                  userMessageId: "616fefbc-48bc-442d-a618-497bbbde3d66"
                }
              };
            }
          }
        }),
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
    expect(b.chat.context).toEqual({});
    expect(b.chat.prompt).toEqual(
      'Given the following conversation thread history in JSON:\n[{"name":"Gregory Spengler","message":"I find you punny and would like to smell your nose letter","date":"2017-11-30T23:52:30.000Z"}]\n----------\nmore'
    );
    expect(b.chat.output.conversationId).toEqual('80a6642c-8b3d-433e-a9cb-233b42a0d63a');
    expect(b.chat.output.systemMessageId).toEqual('e5a23752-3f31-4fee-83fe-56fbd7803540');
    expect(b.chat.output.outputText).toEqual('This is a simple text\n and now with a \n*header*\n*another header*');
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
        block_id: 'feedback-80a6642c-8b3d-433e-a9cb-233b42a0d63a-e5a23752-3f31-4fee-83fe-56fbd7803540',
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
    ]);
  });  
});