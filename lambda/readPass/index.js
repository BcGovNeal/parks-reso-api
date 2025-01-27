const AWS = require('aws-sdk');
const jwt = require('jsonwebtoken');
const axios = require('axios');

const { runQuery } = require('../dynamoUtil');
const { sendResponse } = require('../responseUtil');
const { checkPermissions } = require('../permissionUtil');

exports.handler = async (event, context) => {
  console.log('Read Pass', event);
  console.log('event.queryStringParameters', event.queryStringParameters);

  let queryObj = {
    TableName: process.env.TABLE_NAME
  };

  try {
    if (!event.queryStringParameters) {
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }
    if (event.queryStringParameters.facilityName && event.queryStringParameters.park) {
      if ((await checkPermissions(event)) === false) {
        return sendResponse(403, { msg: 'Unauthorized' });
      }
      // Get all the passes for a specific facility
      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'pass::' + event.queryStringParameters.park };
      queryObj.ExpressionAttributeValues[':facilityName'] = { S: event.queryStringParameters.facilityName };
      queryObj.KeyConditionExpression = 'pk =:pk';
      queryObj.FilterExpression = 'facilityName =:facilityName';

      if (event.queryStringParameters.passType) {
        queryObj.ExpressionAttributeValues[':passType'] = AWS.DynamoDB.Converter.input(
          event.queryStringParameters.passType
        );
        queryObj = checkAddExpressionAttributeNames(queryObj);
        queryObj.ExpressionAttributeNames['#theType'] = 'type';
        queryObj.FilterExpression += ' AND #theType =:passType';
      }

      // Filter Date
      if (event.queryStringParameters.date) {
        const theDate = new Date(event.queryStringParameters.date);
        const dateselector = theDate.toISOString().split('T')[0];
        queryObj = checkAddExpressionAttributeNames(queryObj);
        queryObj.ExpressionAttributeNames['#theDate'] = 'date';
        queryObj.ExpressionAttributeValues[':theDate'] = AWS.DynamoDB.Converter.input(dateselector);
        queryObj.FilterExpression += ' AND contains(#theDate, :theDate)';
      }
      // Filter reservation number
      if (event.queryStringParameters.reservationNumber) {
        queryObj.ExpressionAttributeValues[':sk'] = { S: event.queryStringParameters.reservationNumber };
        queryObj.KeyConditionExpression += ' AND sk =:sk';
      }
      // Filter first/last
      if (event.queryStringParameters.firstName) {
        queryObj = checkAddExpressionAttributeNames(queryObj);
        queryObj.ExpressionAttributeNames['#firstName'] = 'firstName';
        queryObj.ExpressionAttributeValues[':firstName'] = AWS.DynamoDB.Converter.input(
          event.queryStringParameters.firstName
        );
        queryObj.FilterExpression += ' AND #firstName =:firstName';
      }
      if (event.queryStringParameters.lastName) {
        queryObj = checkAddExpressionAttributeNames(queryObj);
        queryObj.ExpressionAttributeNames['#lastName'] = 'lastName';
        queryObj.ExpressionAttributeValues[':lastName'] = AWS.DynamoDB.Converter.input(
          event.queryStringParameters.lastName
        );
        queryObj.FilterExpression += ' AND #lastName =:lastName';
      }
      queryObj = paginationHandler(queryObj, event);

      console.log('queryObj:', queryObj);
      const passData = await runQuery(queryObj, true);
      return sendResponse(200, passData, context);
    } else if (event.queryStringParameters.passes && event.queryStringParameters.park) {
      console.log('Grab passes for this park');
      if ((await checkPermissions(event)) === false) {
        return sendResponse(403, { msg: 'Unauthorized' });
      }
      // Grab passes for this park.
      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'pass::' + event.queryStringParameters.park };
      queryObj.KeyConditionExpression = 'pk =:pk';
      queryObj = paginationHandler(queryObj, event);
      const passData = await runQuery(queryObj, true);
      return sendResponse(200, passData, context);
    } else if (
      event.queryStringParameters.passId &&
      event.queryStringParameters.email &&
      event.queryStringParameters.park
    ) {
      console.log('Get the specific pass, this person is NOT authenticated');
      // Get the specific pass, this person is NOT authenticated
      queryObj.ExpressionAttributeValues = {};
      queryObj.ExpressionAttributeValues[':pk'] = { S: 'pass::' + event.queryStringParameters.park };
      queryObj.ExpressionAttributeValues[':sk'] = { S: event.queryStringParameters.passId };
      queryObj.ExpressionAttributeValues[':email'] = { S: event.queryStringParameters.email };
      queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
      queryObj.FilterExpression = 'email =:email';
      console.log('queryObj', queryObj);
      queryObj = paginationHandler(queryObj, event);
      const passData = await runQuery(queryObj, true);
      console.log('passData', passData);

      if (passData && passData.data && passData.data.length !== 0) {
        const theDate = new Date(passData.data[0].date);
        const dateselector = theDate.toISOString().split('T')[0];

        // Build cancellation email payload
        const claims = {
          iss: 'bcparks-lambda',
          sub: 'readPass',
          passId: event.queryStringParameters.passId,
          facilityName: passData.data[0].facilityName,
          numberOfGuests: passData.data[0].numberOfGuests,
          dateselector: dateselector,
          type: passData.data[0].type,
          parkName: passData.data[0].pk.split('::')[1]
        };
        const token = jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: '15m' });

        const cancellationLink =
          process.env.PUBLIC_FRONTEND +
          process.env.PASS_CANCELLATION_ROUTE +
          '?passId=' +
          passData.data[0].registrationNumber +
          '&park=' +
          event.queryStringParameters.park +
          '&code=' +
          token;

        const encodedCancellationLink = encodeURI(cancellationLink);

        let personalisation = {
          registrationNumber: passData.data[0].registrationNumber.toString(),
          link: encodedCancellationLink
        };

        // Send email
        // Public page after 200OK should show 'check your email'
        try {
          await axios({
            method: 'post',
            url: process.env.GC_NOTIFY_API_PATH,
            headers: {
              Authorization: process.env.GC_NOTIFY_API_KEY,
              'Content-Type': 'application/json'
            },
            data: {
              email_address: passData.data[0].email,
              template_id: process.env.GC_NOTIFY_CANCEL_TEMPLATE_ID,
              personalisation: personalisation
            }
          });

          return sendResponse(200, personalisation);
        } catch (err) {
          let errRes = personalisation;
          errRes['err'] = 'Email Failed to Send';
          return sendResponse(200, errRes);
        }
      } else {
        return sendResponse(400, { msg: 'Invalid Request, pass does not exist' }, context);
      }
    } else if (event.queryStringParameters.passId && event.queryStringParameters.park) {
      if ((await checkPermissions(event)) === false) {
        return sendResponse(403, { msg: 'Unauthorized!' });
      } else {
        // Get the specific pass
        queryObj.ExpressionAttributeValues = {};
        queryObj.ExpressionAttributeValues[':pk'] = { S: 'pass::' + event.queryStringParameters.park };
        queryObj.ExpressionAttributeValues[':sk'] = { S: event.queryStringParameters.passId };
        queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
        const passData = await runQuery(queryObj, true);
        return sendResponse(200, passData, context);
      }
    } else {
      console.log('Invalid Request');
      return sendResponse(400, { msg: 'Invalid Request' }, context);
    }
  } catch (err) {
    console.log(err);
    return sendResponse(400, err, context);
  }
};

const checkAddExpressionAttributeNames = function (queryObj) {
  if (!queryObj.ExpressionAttributeNames) {
    queryObj.ExpressionAttributeNames = {};
  }
  return queryObj;
};

const paginationHandler = function (queryObj, event) {
  if (event.queryStringParameters.ExclusiveStartKeyPK && event.queryStringParameters.ExclusiveStartKeySK) {
    // Add the next page.
    queryObj.ExclusiveStartKey = {
      pk: AWS.DynamoDB.Converter.input(event.queryStringParameters.ExclusiveStartKeyPK),
      sk: AWS.DynamoDB.Converter.input(event.queryStringParameters.ExclusiveStartKeySK)
    };
  }
  return queryObj;
};
