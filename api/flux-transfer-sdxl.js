// flux-transfer-sdxl.js
// PicoArt v43 - SDXL Lightning 통합 버전
// FLUX와 SDXL 모두 지원

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

const { convertFluxToSDXL } = require('./services/sdxlPromptOptimizer.js');
const styleGuides = require('./services/styleGuides.js');
const orientalArt = require('./services/orientalArt.js');
const { rateLimiter } = require('./services/rateLimiter.js');

// ========================================
// 메인 핸들러 - FLUX/SDXL 자동 선택
// ========================================
async function handler(req, res) {
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
    const { image, prompt: basePrompt, style, useSDXL = true } = req.body; // 기본값 SDXL 사용

    if (!image || !basePrompt) {
      return res.status(400).json({ 
        error: 'Missing required fields', 
        required: ['image', 'prompt'] 
      });
    }

    const modelType = useSDXL ? 'SDXL Lightning' : 'FLUX Depth';
    
    console.log('\n========================================');
    console.log(`🎨 ${modelType} TRANSFER REQUEST - v43`);
    console.log('========================================');
    console.log('📝 Base Prompt:', basePrompt.substring(0, 100) + '...');
    console.log('🎯 Style:', style?.name || 'Unknown');
    console.log('🚀 Model:', modelType);
    
    // 1. 이미지 분석
    console.log('\n📸 Analyzing image...');
    const imageAnalysis = await analyzeImageForArtist(image);
    console.log('📊 Analysis:', imageAnalysis);

    // 2. 스타일 가이드라인
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

    // 4. 프롬프트 빌드
    let finalPrompt = buildArtistPrompt(
      basePrompt, 
      artistSelection.artist, 
      style
    );
    
    finalPrompt = cleanupPrompt(finalPrompt);
    
    // 5. 모델별 처리
    let response;
    if (useSDXL) {
      // SDXL Lightning 사용
      console.log('\n⚡ Using SDXL Lightning (Fast & Cheap)');
      
      // SDXL용 프롬프트 최적화
      const { prompt: sdxlPrompt, negative_prompt } = convertFluxToSDXL(
        finalPrompt, 
        style, 
        artistSelection.artist
      );
      
      response = await callSDXLAPI(image, sdxlPrompt, negative_prompt);
      
      console.log('💰 Cost: $0.011 (saved 72.5%)');
      console.log('⚡ Speed: ~2 seconds');
      
    } else {
      // FLUX Depth 사용 (기존)
      console.log('\n🎨 Using FLUX Depth (High Quality)');
      const controlStrength = getControlStrength(finalPrompt);
      response = await callFluxAPI(image, finalPrompt, controlStrength);
      
      console.log('💰 Cost: $0.04');
      console.log('⏱️ Speed: ~5 seconds');
    }

    // 6. 결과 반환
    res.status(200).json({
      ...response,
      selected_artist: artistSelection.artist,
      selection_method: artistSelection.method,
      selection_details: artistSelection.details,
      model_used: modelType,
      cost: useSDXL ? 0.011 : 0.04
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
// SDXL Lightning API 호출
// ========================================
async function callSDXLAPI(image, prompt, negativePrompt) {
  return rateLimiter.addToQueue(async () => {
    const response = await fetch(
      'https://api.replicate.com/v1/models/bytedance/sdxl-lightning-4step/predictions',
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${process.env.REPLICATE_API_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'wait'
        },
        body: JSON.stringify({
          input: {
            prompt: prompt,
            negative_prompt: negativePrompt,
            image: image,
            num_inference_steps: 4,
            guidance_scale: 0,
            scheduler: "K_EULER",
            num_outputs: 1,
            disable_safety_checker: false,
            output_format: "jpg",
            output_quality: 90
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('SDXL Lightning error:', response.status, errorText);
      
      if (response.status === 429) {
        const errorData = JSON.parse(errorText);
        const error = new Error(errorData.detail || 'Rate limited');
        error.status = 429;
        error.retry_after = errorData.retry_after || 10;
        throw error;
      }
      
      throw new Error(`SDXL API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ SDXL Lightning completed');
    
    return data;
  });
}

// ========================================
// FLUX Depth API 호출 (기존)
// ========================================
async function callFluxAPI(image, prompt, controlStrength) {
  return rateLimiter.addToQueue(async () => {
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
      
      if (response.status === 429) {
        const errorData = JSON.parse(errorText);
        const error = new Error(errorData.detail || 'Rate limited');
        error.status = 429;
        error.retry_after = errorData.retry_after || 10;
        throw error;
      }
      
      throw new Error(`FLUX API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ FLUX Depth completed');
    
    return data;
  });
}

// ========================================
// 헬퍼 함수
// ========================================
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

module.exports = handler;
