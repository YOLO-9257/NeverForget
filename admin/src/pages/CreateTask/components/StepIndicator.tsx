/**
 * 步骤指示器组件
 * @author zhangws
 */

import React from 'react';
import styles from './StepIndicator.module.css';

interface Step {
    number: number;
    label: string;
}

interface StepIndicatorProps {
    steps: Step[];
    currentStep: number;
}

export const StepIndicator: React.FC<StepIndicatorProps> = ({ steps, currentStep }) => {
    return (
        <div className={styles.container}>
            {steps.map((step, index) => (
                <React.Fragment key={step.number}>
                    <div
                        className={`${styles.step} ${currentStep >= step.number ? styles.active : ''} ${currentStep > step.number ? styles.completed : ''
                            }`}
                    >
                        <div className={styles.number}>
                            {currentStep > step.number ? '✓' : step.number}
                        </div>
                        <div className={styles.label}>{step.label}</div>
                    </div>
                    {index < steps.length - 1 && <div className={styles.line} />}
                </React.Fragment>
            ))}
        </div>
    );
};

export default StepIndicator;
