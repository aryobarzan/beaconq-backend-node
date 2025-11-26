import { Request, Response } from 'express';

const functions = {
  // DEPRECATED: Ebisu models have been superseded by FSRS models (see fsrsActions.js).
  // For backward-compatibility with older client versions, the old endpoint remains with a generic response.
  storeEbisuModels: function (_: Request, res: Response) {
    return res.status(200).send({
      message: 'Ebisu models stored or updated.',
      insertedCount: 0,
      updatedCount: 0,
    });
  },
};

export default functions;
