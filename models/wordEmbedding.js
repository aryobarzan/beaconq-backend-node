var mongoose = require("mongoose");
var Schema = mongoose.Schema;
var wordEmbeddingSchema = new Schema(
  {
    word: {
      type: String,
      required: true,
    },
    language: {
      type: String,
      required: true,
    },
    wordEmbedding: {
      type: String,
      required: true,
    },
  },
  { collection: "word_embeddings", timestamps: true },
);
wordEmbeddingSchema.index({ word: 1, language: 1 }, { unique: true });
module.exports = mongoose.model("WordEmbedding", wordEmbeddingSchema);
