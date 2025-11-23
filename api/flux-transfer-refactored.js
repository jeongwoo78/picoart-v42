// flux-transfer-refactored.js
// PicoArt v42 - 리팩토링된 버전
// 모듈화된 구조로 재구성

const { 
  selectArtistWithAI, 
  analyzeImageForArtist, 
  getArtistGuidelines 
} = require('./services/artistSelector.js');

const { 
  buildArtistPrompt, 
  getControlStrength, 
  cleanupPrompt,
  logPromptDetails
} = require('./services/promptBuilder.js');

const styleGuides = require('./services/styleGuides.js');
const orientalArt = require('./services/orientalArt.js');

// ========================================
// 메인 핸들러
// ========================================
export default async function handler(req, res) {
  // CORS 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, prompt: basePrompt, style } = req.body;

    if (!image || !basePrompt) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        required: ['image', 'prompt'] 
      });
    }

    console.log('\n========================================');
    console.log('🎨 FLUX TRANSFER REQUEST - v42 REFACTORED');
    console.log('========================================');
    console.log('📝 Base Prompt:', basePrompt.substring(0, 100) + '...');
    console.log('🎯 Style:', style?.name || 'Unknown');
    
    // 1. 이미지 분석
    console.log('\n📸 Analyzing image...');
    const imageAnalysis = await analyzeImageForArtist(image);
    console.log('📊 Analysis:', imageAnalysis);

    // 2. 스타일 가이드라인 가져오기
    const guidelines = getStyleGuidelines(style);
    console.log('📚 Guidelines loaded for:', style?.era || style?.movement);

    // 3. AI로 아티스트 선택
    console.log('\n🤖 Selecting artist with AI...');
    const artistSelection = await selectArtistWithAI(
      imageAnalysis, 
      style, 
      guidelines
    );
    
    console.log('✅ Selected:', artistSelection.artist);
    console.log('📋 Method:', artistSelection.method);
    console.log('💭 Details:', artistSelection.details);

    // 4. 프롬프트 빌드
    let finalPrompt = buildArtistPrompt(
      basePrompt, 
      artistSelection.artist, 
      style
    );
    
    // 5. 프롬프트 정리
    finalPrompt = cleanupPrompt(finalPrompt);
    
    // 6. 컨트롤 강도 결정
    const controlStrength = getControlStrength(finalPrompt);
    
    // 디버그 로깅
    logPromptDetails(basePrompt, finalPrompt, artistSelection.artist);

    // 7. Replicate API 호출
    console.log('🚀 Calling Replicate API...');
    const response = await callReplicateAPI(
      image, 
      finalPrompt, 
      controlStrength
    );

    // 8. 결과 반환
    res.status(200).json({
      ...response,
      selected_artist: artistSelection.artist,
      selection_method: artistSelection.method,
      selection_details: artistSelection.details
    });
    
  } catch (error) {
    console.error('❌ Handler error:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// ========================================
// 헬퍼 함수들
// ========================================

// 스타일별 가이드라인 가져오기
function getStyleGuidelines(style) {
  if (!style) return '';
  
  const guideMap = {
    'ancient': styleGuides.getAncientGreekRomanGuidelines,
    'medieval': styleGuides.getMedievalGuidelines,
    'renaissance': styleGuides.getRenaissanceGuidelines,
    'baroque': styleGuides.getBaroqueGuidelines,
    'rococo': styleGuides.getRococoGuidelines,
    'neoclassical': styleGuides.getNeoclassicalRomanticismRealismGuidelines,
    'romantic': styleGuides.getNeoclassicalRomanticismRealismGuidelines,
    'realist': styleGuides.getNeoclassicalRomanticismRealismGuidelines,
    'impressionism': styleGuides.getImpressionismGuidelines,
    'post-impressionism': styleGuides.getPostImpressionismGuidelines,
    'fauvism': styleGuides.getFauvismGuidelines,
    'expressionism': styleGuides.getExpressionismGuidelines,
    'korean': orientalArt.getKoreanArtGuidelines,
    'chinese': orientalArt.getChineseArtGuidelines,
    'japanese': orientalArt.getJapaneseArtGuidelines
  };
  
  const era = (style.era || style.movement || '').toLowerCase();
  const guideFunction = guideMap[era];
  
  return guideFunction ? guideFunction() : '';
}

// Replicate API 호출
async function callReplicateAPI(image, prompt, controlStrength) {
  const response = await fetch(
    'https://api.replicate.com/v1/models/black-forest-labs/flux-depth-dev/predictions',
    {
      method: 'POST',
      headers: {
        'Authorization': `Token ${process.env.REPLICATE_API_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'wait'
      },
      body: JSON.stringify({
        input: {
          control_image: image,
          prompt: prompt,
          num_inference_steps: 24,
          guidance: 12,
          control_strength: controlStrength,
          output_format: 'jpg',
          output_quality: 90
        }
      })
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error('FLUX Depth error:', response.status, errorText);
    throw new Error(`FLUX API error: ${response.status}`);
  }

  const data = await response.json();
  console.log('✅ FLUX Depth completed');
  
  return data;
}

// ========================================
// 익스포트
// ========================================
module.exports = handler;
module.exports.getStyleGuidelines = getStyleGuidelines;
module.exports.callReplicateAPI = callReplicateAPI;
