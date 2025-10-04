import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { Table } from "dynamodb-toolbox";

if (!process.env.STATE_TABLE_NAME) {
  throw new Error("STATE_TABLE_NAME is not set");
}
const STATE_TABLE_NAME = process.env.STATE_TABLE_NAME;

// Configure DynamoDB client with local endpoint support
// Auto-detect local development by table name containing '-local'
const isLocal = STATE_TABLE_NAME.includes("-local");
const clientConfig = isLocal
  ? {
      endpoint: "http://host.docker.internal:8000",
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "dummy",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "dummy",
      },
    }
  : process.env.AWS_ENDPOINT_URL
  ? {
      endpoint: process.env.AWS_ENDPOINT_URL,
      region: process.env.AWS_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || "dummy",
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || "dummy",
      },
    }
  : {};

const dynamoClient = new DynamoDBClient(clientConfig);
const documentClient = DynamoDBDocumentClient.from(dynamoClient);

// Define the DynamoDB table
export const StateTable = new Table({
  name: STATE_TABLE_NAME,
  partitionKey: { name: "PK", type: "string" },
  sortKey: { name: "SK", type: "string" },
  indexes: {
    GSI1: {
      type: "global",
      partitionKey: { name: "GSI1PK", type: "string" },
      sortKey: { name: "GSI1SK", type: "string" },
    },
  },
  documentClient,
});
