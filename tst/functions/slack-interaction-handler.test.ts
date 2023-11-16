import { handler } from '@functions/slack-interaction-handler';
import { Callback, Context } from 'aws-lambda';
import { MOCK_AWS_RESPONSE, MOCK_DEPENDENCIES, MOCK_ENV } from '@tst/mocks/mocks';

describe('Slack interaction handler test', () => {
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

  test('Should do nothing without a payload', async () => {
    const response = await handler(
      {
        headers: {},
        body: 'not_a_payload'
      },
      {} as Context,
      {} as Callback,
      MOCK_DEPENDENCIES,
      MOCK_ENV
    );

    expect(response.statusCode).toEqual(200);
  });

  test('Should do nothing if not a block action', async () => {
    const response = await handler(
      {
        headers: {},
        body: `payload=${encodeURI(
          JSON.stringify({
            type: 'not_an_action'
          })
        )}`
      },
      {} as Context,
      {} as Callback,
      MOCK_DEPENDENCIES,
      MOCK_ENV
    );

    expect(response.statusCode).toEqual(200);
  });

  test('Should do nothing if no message or channel id', async () => {
    const response = await handler(
      {
        headers: {},
        body: `payload=${encodeURI(
          JSON.stringify({
            type: 'block_actions'
          })
        )}`
      },
      {} as Context,
      {} as Callback,
      MOCK_DEPENDENCIES,
      MOCK_ENV
    );

    expect(response.statusCode).toEqual(200);
  });

  test('Should do nothing if no action defined', async () => {
    const response = await handler(
      {
        headers: {},
        body: `payload=${encodeURI(
          JSON.stringify({
            type: 'block_actions',
            message: '',
            channel: {
              id: 'id'
            }
          })
        )}`
      },
      {} as Context,
      {} as Callback,
      MOCK_DEPENDENCIES,
      MOCK_ENV
    );

    expect(response.statusCode).toEqual(200);
  });

  test('Should perform an action', async () => {
    // The intent of this one is to fail when we implement block action so it can be adjusted
    const response = await handler(
      {
        headers: {},
        body: `payload=${encodeURI(
          JSON.stringify({
            type: 'block_actions',
            user: {
              id: 'U043ZH2AG95',
              username: 'benattar',
              name: 'benattar',
              team_id: 'T044E46HKJ6'
            },
            api_app_id: 'A05SC845KRN',
            token: 'sJ5QIJFwDrymvHxcq9ec0aWL',
            container: {
              type: 'message',
              message_ts: '1696925594.949519',
              channel_id: 'D05RGQCS9KQ',
              is_ephemeral: false
            },
            trigger_id: '6015192572003.4150142597618.84a8e9b79787b9dc6b40c982edb9ef50',
            team: {
              id: 'T044E46HKJ6',
              domain: 'bexttec-helm-36495',
              enterprise_id: 'E01C2B11VN2',
              enterprise_name: 'Amazon Sandbox'
            },
            enterprise: {
              id: 'E01C2B11VN2',
              name: 'Amazon Sandbox'
            },
            is_enterprise_install: false,
            channel: {
              id: 'D05RGQCS9KQ',
              name: 'directmessage'
            },
            message: {
              bot_id: 'B05RRP9NXC4',
              type: 'message',
              text: 'Open Slack to view',
              user: 'U05R8PST0H5',
              ts: '1696925594.949519',
              app_id: 'A05SC845KRN',
              blocks: [
                {
                  type: 'section',
                  block_id: 'DhOOs',
                  text: {
                    type: 'mrkdwn',
                    text: ' Mia is an artificial intelligence assistant created by Amazon Web Services to assist their employees. It was launched in 2023 to help employees known as builders with their questions. Mia understands questions in natural language from builders and has a large collection of frequently asked questions organized by topic and country. Builders can ask Mia questions through platforms like Slack. The goal is to expand Mia globally so that all AWS employees can get support through their preferred communication channels. Mia aims to improve the experience for employees by guiding them through their work and answering their queries.',
                    verbatim: false
                  }
                },
                {
                  type: 'actions',
                  block_id: '+w+xX',
                  elements: [
                    {
                      type: 'button',
                      action_id: '73933941-d4b6-469a-b5de-d94fdf02c61d',
                      text: {
                        type: 'plain_text',
                        text: 'View source(s)',
                        emoji: true
                      },
                      style: 'primary',
                      value: '73933941-d4b6-469a-b5de-d94fdf02c61d'
                    }
                  ]
                }
              ],
              team: 'T044E46HKJ6'
            },
            state: {
              values: {}
            },
            response_url:
              'https://hooks.slack.com/actions/T044E46HKJ6/6012367021845/0C7px9s0DCtE6LAZPpzKZtKY',
            actions: [
              {
                action_id: 'VIEW_SOURCES',
                block_id: '+w+xX',
                text: {
                  type: 'plain_text',
                  text: 'View source(s)',
                  emoji: true
                },
                value: '73933941-d4b6-469a-b5de-d94fdf02c61d',
                style: 'primary',
                type: 'button',
                action_ts: '1696925643.530578'
              }
            ]
          })
        )}`
      },
      {} as Context,
      {} as Callback,
      {
        ...MOCK_DEPENDENCIES,
        getItem: async () =>
          Promise.resolve({
            Item: {
              messageId: '73933941-d4b6-469a-b5de-d94fdf02c61d',
              conversationId: '43afa33d-622c-4164-8db8-f40e88076ba0',
              sourceAttribution: [
                {
                  snippet:
                    'Mia (My Internal Assistant) – BeXT Tech – October 2023\n\nOverview\n\nThe objective of this document is to educate key stakeholders on the Mia service and to outline the BeXT Tech team vision, mission and 2024 Tech OP1 commitments. The desired outcome is to gather feedback on our direction, current areas of cross-PXT collaboration, and alignment on 2024 goals. \n\n\n\nIn the BeXT HR Insights Survey (sent Jan-May 2021) builders were asked their preferred methods for engaging with Human Resource Partners (HRPs)/Human Resource Support Partners (HRSPs), builders overwhelmingly chose Slack (74% of total) vs callback via phone (17%) and email (9%). Slack usability metrics as of April 2023 indicate AWS is the top group/workspace at 67% adoption rate with adoption rates trending upward of 51% for overall Amazon-wide adoption. 57 million direct messages (DM) have been sent in the last seven days (See Appendix B ). Launched in February 2023, Mia (My Internal Assistant) is a service currently delivered via Slack created to assist builders[1] with their HR or general support questions. Mia has a custom curated content library (2600 FAQs) that hosts country-specific FAQs built from the most frequently asked questions by builders. To use Mia, the builder opens the Mia channel in Slack and types their question in natural language. Mia then reviews its curated content library and other internal resources (e.g., Inside Amazon, policies, wiki) and responds immediately. In addition, Mia has the capability to send interactive nudges to builders. Mia is built using Natural Language Processing (NLP); you can ask your question to Mia in the same way you would ask it verbally. As of October 2023, Mia via Slack is available to 16,329 builders in India, UK and Australia. Mia for HRP is also live for an early adopter group of 60+ BeXT HRPs as of September 2023; we are targeting end of October 2023 to dial-up the experience for all ~160 BeXT HRPs (see Appendix C for adoption metrics). \n\n\n\nMia Mission and Vision\n\nMission: BeXT Tech aims to provide all AWS builders with an advanced virtual assistant to serve their needs and coach them through their individual journeys. To scale, we will partner with central PXT Tech teams to expand the experience to all Amazonians by 2025.\n\n\n\nVision: Mia will serve as a foundational service, empowering all internal channels (e.g., AtoZ, MyHR, Slack) operating on two fronts, proactively and reactively addressing the evolving demands of employees, 1/Mia will use AI-driven insights to proactively deliver relevant information to employees, offer personalized suggestions, or remind employees of important events or deadlines, and 2/Mia will respond to employee queries in their preferred channel and provide real-time assistance, whether  answering HR-related, tech, or general support questions. When interacting with Mia employees get personalized answers to their queries based on their unique journeys at Amazon.\n\n\n\nMia Launch Learnings\n\nMia builder interactions are distributed around four main topics: 59% are generalist questions (e.g., When do RSU vest?, Can I get the job leveling guidelines, UK bank holidays in 2023), 15% are Human Resource Partners questions (e.g., Team member leaving Amazon, Who is my HRP?, Will I get paid while in sabbatical and stock will keep being vested?',
                  title: 'PXT Mia Alignment Meeting-Oct 8.docx'
                },
                {
                  snippet:
                    'Mia has a custom curated content library (2600 FAQs) that hosts country-specific FAQs built from the most frequently asked questions by builders. To use Mia, the builder opens the Mia channel in Slack and types their question in natural language. Mia then reviews its curated content library and other internal resources (e.g., Inside Amazon, policies, wiki) and responds immediately. In addition, Mia has the capability to send interactive nudges to builders. Mia is built using Natural Language Processing (NLP); you can ask your question to Mia in the same way you would ask it verbally. As of October 2023, Mia via Slack is available to 16,329 builders in India, UK and Australia. Mia for HRP is also live for an early adopter group of 60+ BeXT HRPs as of September 2023; we are targeting end of October 2023 to dial-up the experience for all ~160 BeXT HRPs (see Appendix C for adoption metrics). \n\n\n\nMia Mission and Vision\n\nMission: BeXT Tech aims to provide all AWS builders with an advanced virtual assistant to serve their needs and coach them through their individual journeys. To scale, we will partner with central PXT Tech teams to expand the experience to all Amazonians by 2025.\n\n\n\nVision: Mia will serve as a foundational service, empowering all internal channels (e.g., AtoZ, MyHR, Slack) operating on two fronts, proactively and reactively addressing the evolving demands of employees, 1/Mia will use AI-driven insights to proactively deliver relevant information to employees, offer personalized suggestions, or remind employees of important events or deadlines, and 2/Mia will respond to employee queries in their preferred channel and provide real-time assistance, whether  answering HR-related, tech, or general support questions. When interacting with Mia employees get personalized answers to their queries based on their unique journeys at Amazon.\n\n\n\nMia Launch Learnings\n\nMia builder interactions are distributed around four main topics: 59% are generalist questions (e.g., When do RSU vest?, Can I get the job leveling guidelines, UK bank holidays in 2023), 15% are Human Resource Partners questions (e.g., Team member leaving Amazon, Who is my HRP?, Will I get paid while in sabbatical and stock will keep being vested? ), 26% are LLM questions (e.g., How many vacation days do I have left this year?, How many new hires at Amazon in 2019?, LHR14 reception phone number, Can you help me create an IAM policy, Can you contact IT?, What is my IP address?). See Appendix D for classification. Builders are satisfied with Mia’s curated content at 75%. Negative feedback themes around questions that Mia can’t answer today (LLM, technical question / Sage), and are attributed to the fact that builders want a direct answer to their question instead of being redirected to an internal resource (e.g., “I don’t want links, I want answers,” “too many clicks, don’t take me to an external links,” “I want answers, not a selection of links to follow.”). Nudge campaigns performed in Mia Slack received positive feedback from builders (e.g., 87% thumbs-up for the Australia Tax Deadlines and 81% thumbs-up for the United Kingdom Lift Ratings campaigns).',
                  title: 'PXT Mia Alignment Meeting-Oct 8.docx'
                },
                {
                  snippet:
                    'AtoZ Chat - AtoZ Chat will introduce our first, and primary, channel outside of Slack to answer employee’s questions. This introduces Mia as being channel agnostic enabling partner teams to build interfaces for future clients. We are collaborating on a PFX-owned PR-FAQ that outlines the vision for the AtoZ chat experience and overall virtual assistant strategy for PXT. The target date for document completion is November 2023. As a result of this partnership, we will scale Mia outside of AWS via the unified AtoZ and Inside Amazon experiences. \n\n\n\nMia for AWS Builders - Mia for builders is the Slack application launched in 2023, available to AWS employees (see Appendix E for list of features). In 2023, we built the foundation for Mia as a Slack bot in AWS (see  Appendix F for system design) integrating with internal services (e.g., the People API (PAPI), Internal Search API (ISK), AmazonBI) and launched in the AWS Slack Workspace enabling us to learn and react to builder feedback. In 2024, we will experiment with generative AI, specifically, Retrieval Augmented Generation (RAG) to address direct builder feedback that they would prefer 1/ direct answers to their questions or deep linking to pages providing them with the relevant answer, and 2/ context-based conversations. We will partner with the PXF and PXT Central Science teams to train a model capable of answering questions and exposing search results in a conversational manner in Mia. Together, we will scale Mia as the conversational engine for Inside Amazon and provide Mia’s FAQ content automation system for Curio pinned items management. Throughout our experimentation, we will launch Mia globally to 120k+ AWS builders in local language by YE 2024.\n\n\n\nIntegration with AWS Lex (AWS AI) – The AWS Lex and Kendra teams engaged BeXT Tech in a workstream (see Appendix L for full list) introducing an abstraction layer on top of AWS AI LLMs / RAG chatbots (codename Plato - to be disclosed at re:Invent 2023) enabling any AWS AI bots to interface with Slack (similar to Mia current state) and to respond via private and public channels. The motivation behind this work is to enable external and internal customers to benefit from the interface built between Slack and Mia for their own LLM RAG AWS chatbots. In 4Q23, we will experiment with this abstraction from Slack to Plato using Mia’s curated content as a data-source to progress towards our 2024 goal related to personalized conversational engine and LLM. Mia for BeXT HRPs - HRPs support complex, variable populations, across multiple countries and jurisdictions whose needs lead to unpredictable demands and variability in workloads. 1/HRP to builder ratios don’t consider the full complexities involved in supporting these populations and how much time and effort HRPs spend to resolve cases. 2/HRPs have to navigate Amazon’s internal systems to search for information and knowing where to search is a challenge, especially for new HRPs and even when they know where to look, often times, there isn’t information available or it’s outdated, incomplete or irrelevant. 3/HRPs are supporting up to 15+ countries in regions and while it’s easier to scale in locations such UK and Ireland, due to large, establish builder populations and maturity of business in that country in terms of HR policies, procedures, support from COE teams etc., for newer, smaller countries, that are less mature and established in terms of policies, procedures and tools, there isn’t the same level of support and expertise available. In such cases, HRPs are often the single point of contact for HR related matters for builders and managers.',
                  title: 'PXT Mia Alignment Meeting-Oct 8.docx'
                }
              ],
              ts: 1696925594542
            },
            ...MOCK_AWS_RESPONSE
          })
      },
      MOCK_ENV
    );

    expect(response.statusCode).toEqual(200);
  });
});
