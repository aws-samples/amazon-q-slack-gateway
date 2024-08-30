const amazonQValidStreamResponse1 = {
    $metadata: {
      httpStatusCode: 200,
      requestId: 'abcd1234-efgh-5678-ijkl-9012mnop3456',
      extendedRequestId: undefined,
      cfId: undefined,
      attempts: 1,
      totalRetryDelay: 0
    },
    outputStream: {
      [Symbol.asyncIterator]: async function* () {
        yield {
          metadataEvent: {
            conversationId: "80a6642c-8b3d-433e-a9cb-233b42a0d63a",
            finalTextMessage: "The Pillars of the Well Architected Framework",
            sourceAttributions: [
              {
                citationNumber: 1,
                snippet: "As you deploy these systems into live environments...",
                textMessageSegments: [
                  {
                    beginOffset: 0,
                    endOffset: 200,
                    snippetExcerpt: {
                      text: "The AWS Well-Architected Framework is based on five pillars — operational excellence, security, reliability, performance efficiency, and cost optimization."
                    }
                  }
                ],
                title: "AWS Well-Architected Framework",
                url: "https://aws.amazon.com/architecture/well-architected/"
              }
            ],
            systemMessageId: "e5a23752-3f31-4fee-83fe-56fbd7803540",
            userMessageId: "616fefbc-48bc-442d-a618-497bbbde3d66"
          }
        };
  
        yield {
          textEvent: {
            conversationId: "80a6642c-8b3d-433e-a9cb-233b42a0d63a",
            systemMessage: " # The Pillars of the Well Architected Framework\n\n|Name | Description|\n|:--|:--| \n|Operational Excellence| The ability to run and monitor systems to deliver business value and to continually improve supporting processes and procedures.|\n|Security|The ability to protect information, systems, and assets while delivering business value through risk assessments and mitigation strategies.| \n|Reliability| The ability of a system to recover from infrastructure or service disruptions, dynamically acquire computing resources to meet demand, and mitigate disruptions such as misconfigurations or transient network issues.|\n|Performance Efficiency| The ability to use computing resources efficiently to meet system requirements, and to maintain that efficiency as demand changes and technologies evolve.|\n|Cost Optimization| The ability to run systems to deliver business value at the lowest price point.|",
            systemMessageId: "e5a23752-3f31-4fee-83fe-56fbd7803540",
            userMessageId: "616fefbc-48bc-442d-a618-497bbbde3d66"
          }
        };
      }
    }
  };
  
  const amazonQValidStreamResponse2 = {
    $metadata: {
      httpStatusCode: 200,
      requestId: 'mnop5678-abcd-1234-efgh-9012ijkl3456',
      extendedRequestId: undefined,
      cfId: undefined,
      attempts: 1,
      totalRetryDelay: 0
    },
    outputStream: {
      [Symbol.asyncIterator]: async function* () {
        yield {
          metadataEvent: {
            conversationId: "91a6642c-8b3d-433e-a9cb-233b42a0d63b",
            finalTextMessage: "Simple Text with Header",
            sourceAttributions: [],
            systemMessageId: "f5a23752-3f31-4fee-83fe-56fbd7803541",
            userMessageId: "726fefbc-48bc-442d-a618-497bbbde3d67"
          }
        };
  
        yield {
          textEvent: {
            conversationId: "91a6642c-8b3d-433e-a9cb-233b42a0d63b",
            systemMessage: "This is a simple text\n and now with a \n*header*\n*another header*",
            systemMessageId: "f5a23752-3f31-4fee-83fe-56fbd7803541",
            userMessageId: "726fefbc-48bc-442d-a618-497bbbde3d67"
          }
        };
      }
    }
  };
  
  export { amazonQValidStreamResponse1, amazonQValidStreamResponse2 };