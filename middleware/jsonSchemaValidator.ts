import Ajv from 'ajv';
const ajv = new Ajv();

const userSecretQuestionAnswersSchema = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      question: { type: 'string' },
      answer: { type: 'string' },
    },
    required: ['question', 'answer'],
    additionalProperties: false,
  },
};

const validateUserSecretQuestionAnswersSchema = ajv.compile(
  userSecretQuestionAnswersSchema
);

export default validateUserSecretQuestionAnswersSchema;
