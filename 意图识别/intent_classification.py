#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
意图识别自动标注脚本
基于remark列的内容和starLevel评分进行意图分类
支持多标签分类，结果写入"意图识别"列
"""

import pandas as pd
import re
from collections import defaultdict
import logging

# 设置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class IntentClassifier:
    def __init__(self):
        # 现有分类 + 新增分类
        self.categories = {
            # 原有分类
            '服务不满': [
                'terrible', 'bad', 'poor', 'awful', 'horrible', 'worst', 'disappointed', 
                'frustrated', 'useless', 'waste', 'timeout', 'cut off', 'no answer', 
                'no response', 'not helpful', 'convoluted', 'distraction', 'delay',
                '糟糕', '差', '失望', '不满'
            ],
            '产品故障': [
                'not work', 'doesnt work', 'broken', 'problem', 'issue', 'error', 
                'fail', 'malfunction', 'defect', 'moving', 'calibration', 'gimble not connected',
                '故障', '坏了', '问题', '不工作'
            ],
            '设备维修': [
                'repair', 'fix', 'broken', 'damaged', 'maintenance', 'send for repair',
                'diagnostic', '维修', '修理', '损坏', '检修'
            ],
            '购买咨询': [
                'buy', 'purchase', 'order', 'price', 'cost', 'sale', 'without', 
                'available', '购买', '买', '订单', '价格', '销售'
            ],
            '保修咨询': [
                'warranty', 'care refresh', 'insurance', 'coverage', 'protection',
                'subscribe', 'plan', '保修', '保险', '保障', '延保'
            ],
            'APP使用': [
                'app', 'application', 'download', 'install', 'software', 'mimo', 
                'dji fly', 'phantom', 'dji app', '应用', '软件', '下载'
            ],
            '物流配送': [
                'delivery', 'shipping', 'shipped', 'address', 'courier', 'expedite',
                'delivered', '配送', '快递', '物流', '发货', '送达'
            ],
            '设备丢失': [
                'lost', 'stolen', 'missing', 'find', 'locate', 'gps', 'track',
                '丢失', '被盗', '找不到', '定位'
            ],
            '设备兼容': [
                'compatible', 'compatibility', 'work with', 'support', 'connect',
                'pair', 'sync', 'link', '兼容', '支持', '连接'
            ],
            '满意表扬': [
                'thank', 'thanks', 'good', 'great', 'excellent', 'best', 'super', 
                'perfect', 'besten', 'alternatives', '谢谢', '好', '棒', '满意', '感谢'
            ],
            '礼貌问候': [
                'hello', 'hi', 'bonjour', 'hola', 'buenas', '你好', '您好', 
                'please', 'thank you'
            ],
            # 新增分类
            '激活设置': [
                'activate', 'activation', 'activating', 'code', 'activate neo',
                'activation code', 'aktivierungscode', '激活', '设置', '配置'
            ],
            '使用指导': [
                'how to', 'how do', 'how can', 'where to', 'where do', 'what is',
                'instructions', 'help with', 'clearer instructions', 'specific responses',
                '如何', '怎么', '指导', '说明'
            ],
            '账户管理': [
                'account', 'remove from account', 'sign in', 'login', 'entfernen',
                'konto', '账户', '登录', '管理'
            ],
            '退换处理': [
                'return', 'refund', 'cancel', 'return label', 'cancelled',
                '退货', '退款', '取消', '退换'
            ]
        }
        
        # 编译正则表达式以提高性能
        self.compiled_patterns = {}
        for category, keywords in self.categories.items():
            pattern = '|'.join(re.escape(keyword) for keyword in keywords)
            self.compiled_patterns[category] = re.compile(pattern, re.IGNORECASE)
    
    def classify_single_remark(self, remark, star_level=None, presale_aftersale=None):
        """
        对单条remark进行意图分类
        返回分类列表（支持多标签）
        """
        if pd.isna(remark) or str(remark).strip() == '':
            return ['无效数据']
        
        remark_str = str(remark)
        matched_categories = []
        
        # 关键词匹配
        for category, pattern in self.compiled_patterns.items():
            if pattern.search(remark_str):
                matched_categories.append(category)
        
        # 如果没有匹配到任何分类，根据星级和售前售后进行推断
        if not matched_categories:
            matched_categories = self._infer_from_context(remark_str, star_level, presale_aftersale)
        
        return matched_categories if matched_categories else ['其他咨询']
    
    def _infer_from_context(self, remark, star_level, presale_aftersale):
        """基于上下文信息推断意图"""
        inferred = []
        
        # 基于星级推断
        if star_level:
            if star_level <= 2.0:
                inferred.append('服务不满')
            elif star_level >= 4.5:
                inferred.append('满意表扬')
        
        # 基于售前售后推断
        if presale_aftersale == '售前':
            if any(word in remark.lower() for word in ['?', 'what', 'how', 'where', 'when']):
                inferred.append('使用指导')
        elif presale_aftersale == '售后':
            if any(word in remark.lower() for word in ['?', 'help', 'support']):
                inferred.append('使用指导')
        
        return inferred
    
    def classify_dataframe(self, df):
        """
        对整个DataFrame进行分类
        """
        logger.info(f"开始处理 {len(df)} 条数据...")
        
        # 确保意图识别列存在
        if '意图分类' not in df.columns:
            df['意图分类'] = ''
        
        classified_count = 0
        category_stats = defaultdict(int)
        
        for idx, row in df.iterrows():
            categories = self.classify_single_remark(
                row['remark'], 
                row.get('starLevel'), 
                row.get('售前/售后')
            )
            
            # 将多个分类用逗号连接
            classification_result = ','.join(categories)
            df.at[idx, '意图分类'] = classification_result
            
            # 统计
            for category in categories:
                category_stats[category] += 1
            classified_count += 1
            
            if classified_count % 100 == 0:
                logger.info(f"已处理 {classified_count} 条数据...")
        
        logger.info(f"分类完成！共处理 {classified_count} 条数据")
        
        # 输出统计信息
        logger.info("分类统计结果：")
        for category, count in sorted(category_stats.items(), key=lambda x: x[1], reverse=True):
            percentage = count / len(df) * 100
            logger.info(f"  {category}: {count}条 ({percentage:.1f}%)")
        
        return df

def main():
    """主函数"""
    input_file = '用户需求意图识别.csv'
    output_file = '用户需求意图识别_已标注.csv'
    
    try:
        # 读取数据
        logger.info(f"读取文件: {input_file}")
        df = pd.read_csv(input_file)
        logger.info(f"读取到 {len(df)} 条数据")
        
        # 创建分类器
        classifier = IntentClassifier()
        
        # 执行分类
        df_classified = classifier.classify_dataframe(df)
        
        # 保存结果
        df_classified.to_csv(output_file, index=False, encoding='utf-8-sig')
        logger.info(f"分类结果已保存到: {output_file}")
        
        # 显示样本结果
        logger.info("\\n样本分类结果：")
        sample_df = df_classified[df_classified['remark'].notna()].head(10)
        for idx, row in sample_df.iterrows():
            remark = str(row['remark'])[:50] + "..." if len(str(row['remark'])) > 50 else str(row['remark'])
            logger.info(f"  [{row.get('starLevel', 'N/A')}星] {remark} -> {row['意图分类']}")
        
    except Exception as e:
        logger.error(f"处理过程中出现错误: {e}")
        raise

if __name__ == "__main__":
    main()
