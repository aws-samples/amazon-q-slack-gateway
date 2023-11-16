import { validateSlackRequest, verifySlackSignature } from '@helpers/slack/slack-helpers';
import { MOCK_ENV } from '@tst/mocks/mocks';

describe('Slack helpers test', () => {
  test('Should verify a valid signature against an invalid secret and failed', async () => {
    const headers = {
      'X-Slack-Request-Timestamp': '1698765388',
      'X-Slack-Signature': 'v0=a14b9bafb83da2adf043ba3384c693e84507cb7e7b27b6266ee4679696fd8a59'
    };

    const body =
      '{"token":"sJ5QIJFwDrymvHxcq9ec0aWL","team_id":"team_id","enterprise_id":"enterprise_id","api_app_id":"api_app_id","event":{"client_msg_id":"20bfd3b0-6d99-4e15-bff0-60af3d3865c1","type":"app_mention","text":"<@U05R8PST0H5> which one is best?","user":"user","ts":"1698765387.549099","blocks":[{"type":"rich_text","block_id":"HalYY","elements":[{"type":"rich_text_section","elements":[{"type":"user","user_id":"user_id"},{"type":"text","text":" which one is best?"}]}]}],"team":"team","thread_ts":"1698765376.332119","parent_user_id":"parent_user_id","channel":"channel","event_ts":"1698765387.549099"},"type":"event_callback","event_id":"Ev063ZKYPR6D","event_time":1698765387,"authorizations":[{"enterprise_id":"enterprise_id","team_id":"team_id","user_id":"user_id","is_bot":true,"is_enterprise_install":false}],"is_ext_shared_channel":false,"event_context":"4-eyJldCI6ImFwcF9tZW50aW9uIiwidGlkIjoiVDA0NEU0NkhLSjYiLCJhaWQiOiJBMDVTQzg0NUtSTiIsImNpZCI6IkMwNVVSRDVQVDQzIn0"}';
    const secret = 'INVALID';
    const date = new Date(1698765388);

    expect(verifySlackSignature(headers, body, secret, date)).toBeFalsy();
    expect(
      await validateSlackRequest(headers, body, MOCK_ENV, {
        getSlackSecret: () =>
          Promise.resolve({
            SlackSigningSecret: secret,
            SlackClientSecret: 'SlackClientSecret',
            SlackClientId: 'SlackClientId',
            SlackBotUserOAuthToken: 'SlackBotUserOAuthToken'
          })
      })
    ).toBeFalsy();
  });
});
