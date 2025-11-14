// Possible status codes
const UpdateCurrentSessionTopicStatus = Object.freeze({
  Updated: 200,
  AlreadyCurrentIndex: 209,
  MissingArguments: 400,
  InvalidSessionId: 452,
  InvalidTopicIndex: 453,
  InternalError: 500,
});

const GetCurrentSessionTopicStatus = Object.freeze({
  Retrieved: 200,
  MissingArguments: 400,
  InvalidSessionId: 452,
  InternalError: 500,
});

const IsSessionActiveStatus = Object.freeze({
  Active: 200,
  Inactive: 209,
  MissingArguments: 400,
  InvalidSessionId: 452,
  InternalError: 500,
});

// DEPRECATED: all of these course session endpoitns have been deprecated.
// For backward-compatibility with older client versions, the endpoints remain, but with a generic response.
var functions = {
  updateCurrentSessionTopic: function (req, res) {
    return res.status(UpdateCurrentSessionTopicStatus.Updated).send({
      message: "Session current topic index updated.",
    });
  },
  getCurrentSessionTopicIndex: function (req, res) {
    return res.status(GetCurrentSessionTopicStatus.Retrieved).send({
      message: "Current session topic index retrieved.",
      currentTopicIndex: 0,
    });
  },
  isSessionActive: function (req, res) {
    return res
      .status(IsSessionActiveStatus.Inactive)
      .send({ message: "Course session is inactive." });
  },
};

module.exports = functions;
