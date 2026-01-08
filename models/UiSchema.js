const { default: mongoose } = require('mongoose');

const UiSchema = new mongoose.Schema(
  {
    modelKey: { type: String, required: true },
    fields: {
      type: Object, // changed from Map
      default: {},
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model('UiSchema', UiSchema);
