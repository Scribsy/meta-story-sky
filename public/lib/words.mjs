// Small, plain-English word lists for the rules. Deliberately short: the model does the reading, these only check it.

/** A word before a name that makes it a person ("Captain Reyes"). */
export const TITLES = new Set(['Mr', 'Mrs', 'Ms', 'Dr', 'Sir', 'Lady', 'Lord', 'King', 'Queen', 'Captain', 'Professor',
  'Inspector', 'Doctor', 'Aunt', 'Uncle', 'Miss', 'Squire']);

/** A word that makes a capitalised run a place ("Hollow Isle", "Mount Ash"). */
export const PLACE_WORDS = new Set(['Street', 'Road', 'Island', 'Isle', 'River', 'Lake', 'Mount', 'Mountain', 'Forest',
  'City', 'Town', 'Village', 'Bay', 'Harbour', 'Harbor', 'Castle', 'Hotel', 'Station', 'Bridge', 'Valley', 'Inn', 'Tavern']);

/** Words in the clue that show a name is a person ("her uncle Bram", "Wren, who…"). */
export const PERSON_CUES = new Set(['he', 'she', 'him', 'her', 'his', 'who', 'named', 'called', 'mother', 'father',
  'sister', 'brother', 'uncle', 'aunt', 'son', 'daughter', 'wife', 'husband', 'friend', 'man', 'woman', 'girl', 'boy']);

/** The word just before a name that shows it is a place ("out to Hollow Isle"). */
export const PLACE_PREPS = new Set(['in', 'at', 'to', 'from', 'near', 'into', 'across', 'toward', 'towards']);

/** Capitalised words that are not names: function words, pronouns and fillers that start sentences. */
export const NOT_NAMES = new Set(['I', 'A', 'An', 'The', 'And', 'But', 'Or', 'So', 'Then', 'If', 'When', 'While',
  'Because', 'He', 'She', 'It', 'They', 'We', 'You', 'Me', 'My', 'His', 'Her', 'Their', 'Our', 'Your', 'This', 'That',
  'These', 'Those', 'There', 'Here', 'What', 'Who', 'Why', 'How', 'Where', 'Which', 'In', 'On', 'At', 'To', 'From',
  'Of', 'For', 'With', 'By', 'After', 'Before', 'One', 'No', 'Yes', 'Not', 'Maybe', 'Um', 'Uh', 'Oh', 'Okay', 'Well',
  'So', 'Just', 'Now', 'Then', 'Every', 'Some', 'Someone', 'Something', 'Nobody', 'Nothing', 'Everyone', 'Is', 'Was']);
