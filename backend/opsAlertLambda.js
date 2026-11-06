'use strict';

const { buildOpsAlertMessage, sendOpsAlert } = require('./opsAlertNotifier.js');

async function handler(event) {
  for (const record of event.Records ?? []) {
    const alarm = JSON.parse(record.Sns.Message);
    const message = buildOpsAlertMessage({
      appName: 'electric-chair-arena',
      alarmName: alarm.AlarmName,
      newState: alarm.NewStateValue,
      reason: alarm.NewStateReason,
    });
    await sendOpsAlert({
      message,
      channelAccessToken: process.env.OPS_ALERT_LINE_CHANNEL_ACCESS_TOKEN,
      userId: process.env.OPS_ALERT_LINE_USER_ID,
    });
  }
}

module.exports = { handler };
