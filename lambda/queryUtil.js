const AWS = require('aws-sdk');
const { dynamodb } = require('./dynamoUtil');

exports.runQuery = async function (query) {
  console.log('query:', query);
  const data = await dynamodb.query(query).promise();
  console.log('data:', data);
  var unMarshalled = data.Items.map(item => {
    return AWS.DynamoDB.Converter.unmarshall(item);
  });
  console.log(unMarshalled);
  return unMarshalled;
};
