'use strict';

module.exports.judgeHanko = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'judgeHanko endpoint',
      input: event,
    }),
  };
};

module.exports.getStage = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'getStage endpoint',
      input: event,
    }),
  };
};

module.exports.updateProgress = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({
      message: 'updateProgress endpoint',
      input: event,
    }),
  };
};
