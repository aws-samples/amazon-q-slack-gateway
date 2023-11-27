import * as AWS from 'aws-sdk';

export const client = new AWS.DynamoDB.DocumentClient({
  region: process.env.AWS_REGION,
  paramValidation: false, // Avoid extra latency
  convertResponseTypes: false // Avoid extra latency
});

export const deleteItem = async (args: AWS.DynamoDB.DocumentClient.DeleteItemInput) =>
  await client.delete(args).promise();

export const putItem = async (args: AWS.DynamoDB.DocumentClient.PutItemInput) =>
  await client.put(args).promise();

export const getItem = async (args: AWS.DynamoDB.DocumentClient.GetItemInput) =>
  await client.get(args).promise();
