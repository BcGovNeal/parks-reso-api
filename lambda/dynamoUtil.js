const AWS = require('aws-sdk');

const options = {
  region: 'ca-central-1'
};

if (process.env.IS_OFFLINE) {
  options.endpoint = 'http://localhost:8000';
}

const dynamodb = new AWS.DynamoDB(options);

exports.dynamodb = new AWS.DynamoDB();

async function setStatus(passes, status) {
  for (let i = 0; i < passes.length; i++) {
    let updateParams = {
      Key: {
        pk: { S: passes[i].pk },
        sk: { S: passes[i].sk }
      },
      ExpressionAttributeValues: {
        ':statusValue': { S: status }
      },
      UpdateExpression: 'SET passStatus = :statusValue',
      ReturnValues: 'ALL_NEW',
      TableName: process.env.TABLE_NAME
    };

    await dynamodb.updateItem(updateParams).promise();
  }
}

async function runQuery(query, paginated = false) {
  console.log('query:', query);
  const data = await dynamodb.query(query).promise();
  console.log('data:', data);
  var unMarshalled = data.Items.map(item => {
    return AWS.DynamoDB.Converter.unmarshall(item);
  });
  console.log(unMarshalled);
  if (paginated) {
    return {
      LastEvaluatedKey: data.LastEvaluatedKey,
      data: unMarshalled
    };
  } else {
    return unMarshalled;
  }
}

module.exports = {
  dynamodb,
  setStatus,
  runQuery
};
