import { Response } from "express";

///
const functions = {
  // DEPRECATED: previously, this endpoint would allow the teacher to delete their ActivityUserAnswers and ScheduledQuizUserStarts.
  // For backwards compatibility, this endpoint still exists but does nothing.
  resetTeacherAnswers: function (
    _: Express.AuthenticatedRequest,
    res: Response,
  ) {
    return res
      .status(500)
      .send({ message: "Answer reset failed: an error occurred." });
  },
};

export default functions;
