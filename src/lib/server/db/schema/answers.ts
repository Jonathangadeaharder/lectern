import { index, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sessionQuestions } from './questions';
import { sessions } from './sessions';

export const answers = sqliteTable(
	'answers',
	{
		id: text('id').primaryKey(),
		sessionId: text('session_id')
			.notNull()
			.references(() => sessions.id, { onDelete: 'cascade' }),
		questionId: text('question_id')
			.notNull()
			.references(() => sessionQuestions.id, { onDelete: 'cascade' }),
		format: text('format').notNull(),
		payloadJson: text('payload_json').notNull(),
		gradingJson: text('grading_json'),
		rawScore: real('raw_score'),
		verdict: text('verdict', {
			enum: ['pass', 'fail', 'borderline', 'review_needed']
		}),
		submittedAt: integer('submitted_at').notNull(),
		gradedAt: integer('graded_at')
	},
	(t) => ({
		sessionIdx: index('answers_session_idx').on(t.sessionId),
		questionIdx: index('answers_question_idx').on(t.questionId)
	})
);
