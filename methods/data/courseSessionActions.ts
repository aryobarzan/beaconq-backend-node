import { Request, Response } from "express";

// DEPRECATED: all of these course session endpoitns have been deprecated.
// For backward-compatibility with older client versions, the endpoints remain, but with a generic response.
const functions = {
  updateCurrentSessionTopic: function (_: Request, res: Response) {
    return res.status(200).send({
      message: "Session current topic index updated.",
    });
  },
  getCurrentSessionTopicIndex: function (_: Request, res: Response) {
    return res.status(200).send({
      message: "Current session topic index retrieved.",
      currentTopicIndex: 0,
    });
  },
  isSessionActive: function (_: Request, res: Response) {
    return res
      .status(209)
      .send({ message: "Course session is inactive." });
  },
};

export default functions;
