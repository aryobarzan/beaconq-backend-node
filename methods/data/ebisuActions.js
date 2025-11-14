const StoreEbisuModelsStatus = Object.freeze({
  Stored: 200,
  MissingArguments: 400,
  InternalError: 500,
});

var functions = {
  // DEPRECATED: Ebisu models have been superseded by FSRS models (see fsrsActions.js).
  // For backward-compatibility with older client versions, the old endpoint remains with a generic response.
  storeEbisuModels: function (req, res) {
    return res.status(StoreEbisuModelsStatus.Stored).send({
      message: "Ebisu models stored or updated.",
      insertedCount: 0,
      updatedCount: 0,
    });
  },
};

module.exports = functions;
