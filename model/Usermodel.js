const participantSchema = new mongoose.Schema({
  partyName: { type: String, required: true, unique: true },
  participantName: { type: String, required: true },
  partySymbol: { type: String },
  description: { type: String },
  voteCount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

const voterSchema = new mongoose.Schema({
  voterId: { type: String, required: true, unique: true },
  voterName: { type: String, required: true },
  citizenshipNumber: { type: String, required: true, unique: true },
  hasVoted: { type: Boolean, default: false },
  votedFor: { type: mongoose.Schema.Types.ObjectId, ref: 'Participant' },
  votedAt: { type: Date }
});

const Participant = mongoose.model('Participant', participantSchema);
const Voter = mongoose.model('Voter', voterSchema);