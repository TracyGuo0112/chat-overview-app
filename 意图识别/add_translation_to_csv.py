#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
为CSV文件添加翻译列
将remark列的内容翻译成中文
"""

import pandas as pd
import logging
import time
import re
import requests
import json
import urllib.parse
import warnings
warnings.filterwarnings('ignore')

# 设置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class CSVRemarkTranslator:
    def __init__(self):
        self.translation_cache = {}
        self.session = requests.Session()
        # 设置请求头
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        
    def detect_language(self, text):
        """检测文本语言"""
        if not text or pd.isna(text) or str(text).strip() == '':
            return 'unknown'
        
        text_str = str(text).strip()
        
        # 简单的语言检测规则
        # 检测中文
        if re.search(r'[\u4e00-\u9fff]', text_str):
            return 'zh'
        
        # 检测韩文
        if re.search(r'[\uac00-\ud7af]', text_str):
            return 'ko'
        
        # 检测日文
        if re.search(r'[\u3040-\u309f\u30a0-\u30ff]', text_str):
            return 'ja'
        
        # 检测法文常见词汇
        french_words = ['et', 'le', 'de', 'un', 'à', 'être', 'avoir', 'que', 'pour', 'dans', 'ce', 'il', 'une', 'sur', 'avec', 'ne', 'se', 'pas', 'tout', 'mais', 'effectuée', 'sans']
        if any(word in text_str.lower() for word in french_words):
            return 'fr'
        
        # 检测德文常见词汇
        german_words = ['der', 'die', 'und', 'in', 'den', 'von', 'zu', 'das', 'mit', 'sich', 'des', 'auf', 'für', 'ist', 'im', 'dem', 'nicht', 'ein', 'eine', 'als', 'auch', 'es', 'an', 'werden', 'aus', 'er', 'hat', 'dass', 'sie', 'nach', 'wird', 'bei', 'einer', 'um', 'am', 'sind', 'noch', 'wie', 'einem', 'über', 'einen', 'so', 'zum', 'war', 'haben', 'nur', 'oder', 'aber', 'vor', 'zur', 'bis', 'mehr', 'durch', 'man', 'sein', 'wurde', 'sei', 'kann', 'wo', 'kaufen']
        if any(word in text_str.lower() for word in german_words):
            return 'de'
        
        # 其他假设为英文或自动检测
        return 'auto'
    
    def translate_with_google_api(self, text, source_lang='auto', target_lang='zh'):
        """使用Google翻译API翻译文本"""
        try:
            # 构建请求URL
            base_url = "https://translate.googleapis.com/translate_a/single"
            params = {
                'client': 'gtx',
                'sl': source_lang,
                'tl': target_lang,
                'dt': 't',
                'q': text
            }
            
            response = self.session.get(base_url, params=params, timeout=10)
            response.raise_for_status()
            
            # 解析响应
            result = response.json()
            if result and len(result) > 0 and len(result[0]) > 0:
                translated = result[0][0][0]
                return translated
            else:
                return None
                
        except Exception as e:
            logger.debug(f"Google API翻译失败: {str(e)}")
            return None
    
    def translate_text(self, text, max_retries=3):
        """翻译文本到中文"""
        if not text or pd.isna(text) or str(text).strip() == '':
            return ''
        
        text_str = str(text).strip()
        
        # 检查缓存
        if text_str in self.translation_cache:
            return self.translation_cache[text_str]
        
        # 检测语言
        lang = self.detect_language(text_str)
        
        # 如果已经是中文，直接返回
        if lang == 'zh':
            self.translation_cache[text_str] = text_str
            return text_str
        
        # 限制文本长度，避免翻译API错误
        if len(text_str) > 500:
            text_str = text_str[:500] + '...'
        
        # 翻译
        for attempt in range(max_retries):
            try:
                # 尝试使用Google翻译API
                translated = self.translate_with_google_api(text_str, source_lang=lang if lang != 'auto' else 'auto')
                
                if translated:
                    # 缓存结果
                    self.translation_cache[text_str] = translated
                    
                    # 添加延迟避免API限制
                    time.sleep(0.3)
                    
                    return translated
                else:
                    raise Exception("翻译API返回空结果")
                
            except Exception as e:
                logger.warning(f"翻译失败 (尝试 {attempt + 1}/{max_retries}): {str(e)}")
                if attempt < max_retries - 1:
                    time.sleep(2)  # 重试前等待
                else:
                    # 最后一次尝试失败，返回原文
                    logger.error(f"翻译最终失败，返回原文: {text_str[:50]}...")
                    return f"[翻译失败] {text_str}"
        
        return text_str

def add_translation_to_csv():
    """为CSV文件添加翻译列"""
    
    input_file = '/Users/lisa/AI/意图识别/用户需求意图识别_已标注.csv'
    output_file = '/Users/lisa/AI/意图识别/用户需求意图识别_已标注_含翻译.csv'
    
    logger.info(f"开始处理文件: {input_file}")
    
    # 创建翻译器
    translator = CSVRemarkTranslator()
    
    try:
        # 读取CSV文件
        df = pd.read_csv(input_file)
        logger.info(f"读取到 {len(df)} 行数据")
        
        # 检查是否有remark列
        if 'remark' not in df.columns:
            logger.error("CSV文件中没有找到remark列")
            return None
        
        # 检查是否已经有翻译列
        if '翻译' in df.columns:
            logger.info("检测到已存在翻译列，将覆盖...")
        
        # 添加翻译列
        translations = []
        total_rows = len(df)
        
        logger.info("开始翻译remark列内容...")
        
        for idx, row in df.iterrows():
            remark = row['remark']
            translation = translator.translate_text(remark)
            translations.append(translation)
            
            # 显示进度
            if (idx + 1) % 50 == 0:
                logger.info(f"已翻译 {idx + 1}/{total_rows} 条数据 ({(idx + 1)/total_rows*100:.1f}%)...")
            
            # 显示翻译样例
            if idx < 5 and translation and translation != remark:
                logger.info(f"样例 {idx + 1}: '{remark[:50]}...' -> '{translation[:50]}...'")
        
        # 添加翻译列到DataFrame
        df['翻译'] = translations
        
        # 保存到新文件
        df.to_csv(output_file, index=False, encoding='utf-8')
        
        logger.info(f"✅ 翻译完成！")
        logger.info(f"总计翻译: {len([t for t in translations if t and t.strip()])} 条数据")
        logger.info(f"输出文件: {output_file}")
        
        return output_file
        
    except Exception as e:
        logger.error(f"处理文件时出错: {e}")
        raise

def main():
    """主函数"""
    try:
        logger.info("开始为CSV文件添加翻译列...")
        output_file = add_translation_to_csv()
        
        if output_file:
            # 验证结果
            logger.info("验证翻译结果...")
            df = pd.read_csv(output_file)
            
            if '翻译' in df.columns and 'remark' in df.columns:
                logger.info(f"✅ CSV文件包含翻译列，共 {len(df)} 行数据")
                
                # 显示前几行样本
                logger.info("前5行翻译样本:")
                for i in range(min(5, len(df))):
                    if pd.notna(df.iloc[i]['remark']) and pd.notna(df.iloc[i]['翻译']):
                        remark = str(df.iloc[i]['remark'])
                        translation = str(df.iloc[i]['翻译'])
                        logger.info(f"  行 {i+1}:")
                        logger.info(f"    原文: {remark}")
                        logger.info(f"    译文: {translation}")
                        logger.info("    ---")
                
                # 统计翻译情况
                non_empty_remarks = df['remark'].notna().sum()
                non_empty_translations = df['翻译'].notna().sum()
                logger.info(f"统计: remark非空行数 {non_empty_remarks}, 翻译非空行数 {non_empty_translations}")
            else:
                logger.warning("⚠️ 输出文件缺少翻译列或remark列")
            
            print(f"\n🎉 翻译任务完成！")
            print(f"输出文件: {output_file}")
            print("CSV文件已添加'翻译'列，包含remark的中文翻译")
        
    except Exception as e:
        logger.error(f"处理过程中出现错误: {e}")
        raise

if __name__ == "__main__":
    main()
