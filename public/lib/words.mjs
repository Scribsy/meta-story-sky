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

// For wording questions: a plain noun reads "that hedgehog", a quality reads "razor sharp", a past event reads "what
// happened". Short lists of common words; a miss only means the question falls back to a plainer one.

/** Common describing words, so "lonely" or "razor sharp" is never asked about as a thing ("where is lonely?"). */
export const ADJECTIVES = new Set(['sharp', 'cold', 'hot', 'warm', 'cool', 'heavy', 'light', 'quiet', 'loud', 'lonely',
  'dark', 'bright', 'soft', 'hard', 'old', 'young', 'new', 'sad', 'happy', 'angry', 'afraid', 'alone', 'strange', 'empty',
  'silent', 'still', 'wild', 'gentle', 'tiny', 'huge', 'small', 'big', 'tall', 'short', 'long', 'red', 'blue', 'green',
  'black', 'white', 'grey', 'gray', 'golden', 'silver', 'broken', 'tired', 'scared', 'brave', 'hollow', 'sweet', 'bitter',
  'wet', 'dry', 'slow', 'fast', 'deep', 'thin', 'thick', 'pale', 'fragile', 'calm', 'cruel', 'kind', 'shy', 'proud',
  'lost', 'sick', 'ill', 'weak', 'strong', 'free', 'safe', 'dead', 'alive', 'awake', 'asleep', 'bare', 'raw', 'rough',
  'smooth', 'sticky', 'heavy', 'cosy', 'cozy', 'eerie', 'grim', 'odd', 'weird', 'familiar', 'bigger', 'smaller', 'older',
  'darker', 'colder', 'stranger', 'purple', 'pink', 'orange', 'brown', 'yellow', 'crimson', 'ancient', 'secret', 'sudden',
  'gold', 'empty', 'full', 'clear', 'cloudy', 'foggy', 'misty', 'stormy', 'sunny', 'icy', 'frozen', 'tender', 'sore']);

/** Plurals that don't end in -s ("those children", "where are the mice?"). */
export const IRREGULAR_PLURALS = new Set(['people', 'children', 'men', 'women', 'mice', 'geese', 'feet', 'teeth', 'police',
  'cattle', 'oxen', 'lice', 'folk']);

/** Common past tenses without -ed, so "the tide went out" is heard as an event, not a thing. */
export const IRREGULAR_PAST = new Set(['went', 'came', 'stole', 'took', 'gave', 'ran', 'saw', 'found', 'lost', 'left',
  'fell', 'made', 'said', 'told', 'knew', 'thought', 'broke', 'wrote', 'sang', 'swam', 'flew', 'grew', 'drew', 'kept',
  'sat', 'stood', 'slept', 'woke', 'rose', 'began', 'brought', 'bought', 'caught', 'fought', 'taught', 'sent', 'spent',
  'built', 'felt', 'heard', 'met', 'paid', 'sold', 'shot', 'hid', 'bit', 'drove', 'rode', 'spoke', 'froze', 'chose',
  'forgot', 'got', 'led', 'meant', 'put', 'shut', 'struck', 'swore', 'threw', 'tore', 'wore', 'won', 'became', 'ate',
  'drank', 'sank', 'rang', 'held', 'dug', 'hung', 'lit', 'slid', 'stuck', 'woke', 'wept', 'crept', 'fled', 'bled']);

/** Words ending in -ing that are things, not doings ("the king", "a ring"). */
export const ING_NOUNS = new Set(['thing', 'king', 'ring', 'wing', 'sting', 'spring', 'string', 'swing', 'evening',
  'morning', 'ceiling', 'building', 'painting', 'wedding', 'sibling', 'nothing', 'something', 'anything', 'everything',
  'darling', 'duckling', 'pudding', 'viking', 'earring', 'offspring', 'clothing', 'stocking', 'lightning', 'icing',
  'herring', 'bedding', 'dumpling', 'ending', 'beginning', 'meeting', 'feeling', 'drawing', 'opening', 'clearing',
  'landing', 'railing', 'stuffing', 'awning', 'king', 'sapling', 'seedling', 'gosling', 'wellspring', 'inkling']);
