const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    default: 'admin'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const participantSchema = new mongoose.Schema({
  partyName: {
    type: String,
    required: true,
    unique: true
  },
  partyNameNepali: {
    type: String
  },
  partySymbol: {
    type: String
  },
  partyLogo: {
    type: String
  },
  description: {
    type: String
  },
  voteCount: {
    type: Number,
    default: 0
  },
  directSeats: {
    type: Number,
    default: 0
  },
  proportionalSeats: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const partyMemberSchema = new mongoose.Schema({
  participantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Participant',
    required: true
  },
  memberName: {
    type: String,
    required: true
  },
  memberNameNepali: {
    type: String
  },
  position: {
    type: String,
    required: true
  },
  positionNepali: {
    type: String
  },
  wardNumber: {
    type: Number
  },
  type: {
    type: String,
    enum: ['direct', 'proportional'],
    required: true
  },
  voteCount: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// UPDATED VOTER SCHEMA - Now stores multiple votes
const voterSchema = new mongoose.Schema({
  voterId: {
    type: String,
    required: true,
    unique: true
  },
  voterName: {
    type: String,
    required: true
  },
  citizenshipNumber: {
    type: String,
    required: true,
    unique: true
  },
  hasVoted: {
    type: Boolean,
    default: false
  },
  // Proportional vote - vote for a party
  votedForParty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Participant'
  },
  // Direct votes - vote for individual candidates
  votedForCandidates: [{
    memberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PartyMember'
    },
    position: String,
    memberName: String
  }],
  votedAt: {
    type: Date
  }
});

const Admin = mongoose.model('Admin', adminSchema);
const Participant = mongoose.model('Participant', participantSchema);
const PartyMember = mongoose.model('PartyMember', partyMemberSchema);
const Voter = mongoose.model('Voter', voterSchema);

module.exports = {
  Admin,
  Participant,
  PartyMember,
  Voter
};