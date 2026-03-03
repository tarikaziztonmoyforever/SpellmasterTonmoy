export interface TopicWord {
  topic: string;
  word: string;
  meaning_bn: string;
}

export const TOPIC_VOCAB: TopicWord[] = [
  // Politics
  { topic: "Politics", word: "Governance", meaning_bn: "শাসনব্যবস্থা" },
  { topic: "Politics", word: "Legislation", meaning_bn: "আইন প্রণয়ন" },
  { topic: "Politics", word: "Policy implementation", meaning_bn: "নীতিমালা বাস্তবায়ন" },
  { topic: "Politics", word: "Electoral system", meaning_bn: "নির্বাচন পদ্ধতি" },
  { topic: "Politics", word: "Political stability", meaning_bn: "রাজনৈতিক স্থিতিশীলতা" },
  { topic: "Politics", word: "Democracy", meaning_bn: "গণতন্ত্র" },
  { topic: "Politics", word: "Bureaucracy", meaning_bn: "আমলাতন্ত্র" },
  { topic: "Politics", word: "Corruption", meaning_bn: "দুর্নীতি" },
  { topic: "Politics", word: "Public sector", meaning_bn: "সরকারি খাত" },
  { topic: "Politics", word: "Opposition party", meaning_bn: "বিরোধী দল" },
  
  // Medical
  { topic: "Medical", word: "Diagnosis", meaning_bn: "রোগ নির্ণয়" },
  { topic: "Medical", word: "Prognosis", meaning_bn: "রোগের সম্ভাব্য পরিণতি" },
  { topic: "Medical", word: "Clinical trial", meaning_bn: "ক্লিনিক্যাল পরীক্ষা" },
  { topic: "Medical", word: "Prescription", meaning_bn: "ওষুধের নির্দেশ" },
  { topic: "Medical", word: "Vaccination", meaning_bn: "টিকাদান" },
  { topic: "Medical", word: "Outbreak", meaning_bn: "রোগের প্রাদুর্ভাব" },
  { topic: "Medical", word: "Contagious disease", meaning_bn: "সংক্রামক রোগ" },
  { topic: "Medical", word: "Immunization", meaning_bn: "রোগ প্রতিরোধী টিকা" },
  
  // Communication
  { topic: "Communication", word: "Articulate", meaning_bn: " স্পষ্টভাবে প্রকাশ করতে সক্ষম" },
  { topic: "Communication", word: "Persuasive", meaning_bn: "প্রভাবশালী" },
  { topic: "Communication", word: "Misinterpretation", meaning_bn: "ভুল ব্যাখ্যা" },
  { topic: "Communication", word: "Clarification", meaning_bn: "ব্যাখ্যা প্রদান" },
  { topic: "Communication", word: "Non-verbal cues", meaning_bn: "অবাচনিক সংকেত" },
  
  // Environment
  { topic: "Environment", word: "Climate change", meaning_bn: "জলবায়ু পরিবর্তন" },
  { topic: "Environment", word: "Global warming", meaning_bn: "বৈশ্বিক উষ্ণায়ন" },
  { topic: "Environment", word: "Carbon emissions", meaning_bn: "কার্বন নিঃসরণ" },
  { topic: "Environment", word: "Renewable energy", meaning_bn: "নবায়নযোগ্য জ্বালানি" },
  { topic: "Environment", word: "Deforestation", meaning_bn: "বন উজাড়" },
  
  // Technology
  { topic: "Technology", word: "Artificial intelligence", meaning_bn: "কৃত্রিম বুদ্ধিমত্তা" },
  { topic: "Technology", word: "Automation", meaning_bn: "স্বয়ংক্রিয়তা" },
  { topic: "Technology", word: "Innovation", meaning_bn: "উদ্ভাবন" },
  { topic: "Technology", word: "Cybersecurity", meaning_bn: "সাইবার নিরাপত্তা" },
  { topic: "Technology", word: "Digital transformation", meaning_bn: "ডিজিটাল রূপান্তর" }
];
