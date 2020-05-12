import React, { useState, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { cloneDeep, compact, sum } from 'lodash';
import { scaleLinear } from 'd3-scale';
import moment from 'moment';

import ActivityYAxis from 'components/award/shared/activity/ActivityYAxis';
import ActivityXAxis from 'components/award/shared/activity/ActivityXAxis';
import VerticalLine from 'components/sharedComponents/VerticalLine';
import {
    getXDomain,
    lineHelper,
    createSteppedAreaPath,
    filteredAndSortedLinesFirstToLast,
    dateMatchingFirstLineValue,
    shouldExtendAreaPathWhenLastDataPointYValueChange
} from 'helpers/contractGrantActivityHelper';
import { convertDateToFY } from 'helpers/fiscalYearHelper';
import { formatMoney } from 'helpers/moneyFormatter';

const propTypes = {
    height: PropTypes.number,
    padding: PropTypes.object,
    visualizationWidth: PropTypes.number,
    transactions: PropTypes.array,
    awardType: PropTypes.string,
    dates: PropTypes.object
};

const xAxisSpacingPercentage = 0.05;

const todayLineValue = Date.now();

const transactionPathDescription = 'A shaded light blue area moving horizontally between each transactions action date and vertically between each transactions federal action obligation difference';
const areaPathToTodayLineDescription = 'An area path of color light blue representing an area path from the first transaction to the today line';
const areaPathPastEndLineDescription = 'An area path of color grey representing an extension of the area path from the first end date line to the last transaction';

const ContractGrantsActivityChart = ({
    height,
    padding,
    visualizationWidth,
    transactions,
    awardType,
    dates
}) => {
    // x series
    const [xDomain, setXDomain] = useState([]);
    // y series
    const [yDomain, setYDomain] = useState([]);
    // x scale
    const [xScale, setXScale] = useState(null);
    // y scale
    const [yScale, setYScale] = useState(null);
    // x ticks
    const [xTicks, setXTicks] = useState([]);
    // y ticks
    const [yTicks, setYTicks] = useState([]);
    // start line
    const [startLineValue, setStartLineValue] = useState(null);
    // end line
    const [endLineValue, setEndLineValue] = useState(null);
    // potential end line
    const [potentialEndLineValue, setPotentialEndLineValue] = useState(null);
    // x axis spacing
    const [xAxisSpacing, setXAxisSpacing] = useState(0);
    // circle data
    const [circleData, setCircleData] = useState([]);
    // area path
    const [areaPath, setAreaPath] = useState('');
    // area path extension to today line
    const [areaPathExtensionToTodayLine, setAreaPathExtensionToToday] = useState(null);
    // area path past end line
    const [areaPathPastEndLine, setAreaPathPastEndLine] = useState(null);
    // area path extension last data point y value change
    const [
        areaPathExtensionLastDataPointYValueChange,
        setAreaPathExtensionLastDataPointYValueChange
    ] = useState({
        path: null,
        className: '',
        description: ''
    });
    /**
     * createXSeries
     * - creates the x domain and updates state
     */
    const createXDomain = useCallback(() => setXDomain(getXDomain(dates, awardType, transactions)), [
        awardType,
        dates,
        transactions,
        setXDomain
    ]);
    /**
     * createYSeries
     * - creates the y domain and updates state
     * @returns {null}
     */
    const createYDomain = useCallback(() => {
        const clonedTransactions = cloneDeep(transactions);
        clonedTransactions.sort(
            (a, b) => a.running_obligation_total - b.running_obligation_total);
        const yZero = clonedTransactions.length > 1 ?
            clonedTransactions[0].running_obligation_total :
            0;
        const yOne = !clonedTransactions.length ?
            0 :
            clonedTransactions.pop().running_obligation_total;
        setYDomain([yZero, yOne]);
    }, [transactions]);
    // hook - runs only on mount unless transactions change
    useEffect(() => {
        createXDomain();
        createYDomain();
    }, [
        transactions,
        createXDomain,
        createYDomain
    ]);
    /**
     * addLastTickForSpacing
     * - We want to add spacing to the top of the chart based off of the design.
     * To add this space we will add an additional tick to the y-axis by
     * finding the average difference between the ticks and add that to
     * the last tick.
     * @param {Number[]} - an array of numbers.
     * @returns {Number[]} - an array of numbers.
     */
    const addTicksForSpacing = (ticks, first) => {
        if (!ticks.length) return [];
        const updatedTicks = cloneDeep(ticks);
        const differences = compact(ticks.reverse().map((tick, i) => {
            // we do not use the last tick
            if (ticks.length === i + 1) return null;
            return tick - ticks[i + 1];
        }));
        if (!differences.length) return [];
        // average difference
        const averageDifference = differences
            .reduce((acc, data) => acc + data, 0) / differences.length;
        // subtracts the average difference from the first tick and updates the tick array
        if (first) updatedTicks.splice(0, 0, updatedTicks[0] - averageDifference);
        // adds the average difference to the last tick and updates the tick array
        updatedTicks.push(updatedTicks[updatedTicks.length - 1] + averageDifference);
        return updatedTicks;
    };
    /**
     * xTickDateAndLabel
     * - format the x-axis labels
     * @param {Number[]} - an array of dates in milliseconds
     * @returns {Object[]} - an array of objects with date and label properties
     */
    const xTickDateAndLabel = (ticks) => ticks.map((date) => {
        const newDate = new Date(date);
        const year = convertDateToFY(moment(date));
        const shortYear = (year).toString().slice(-2);
        const shortMonth = newDate.toLocaleString('en-us', { month: 'short' }).toUpperCase();
        const label = `${shortMonth} FY '${shortYear}`;
        return { date: newDate, label };
    });
    /**
     * createXScaleAndTicks
     * - creates the x scaling function and updates state
     * @returns {null}
     */
    const createXScaleAndTicks = useCallback(() => {
        if (!xDomain.length) return null;
        /**
         * By design, we want to leave space between the start of the chart
         * and the end of the chart.
         */
        const spacing = visualizationWidth * xAxisSpacingPercentage;
        const scale = scaleLinear()
            .domain(xDomain)
            .range([spacing, visualizationWidth - spacing - padding.left]);
        let theTicks = scale.ticks(6);
        // add first and last tic per design
        theTicks.splice(0, 0, xDomain[0]); // first tick
        theTicks.push(xDomain[1]); // last tick

        const differencesBetweenEachTick = theTicks.reverse().reduce((acc, tick, i, src) => {
            const nextTick = src[i + 1];
            if (!nextTick) return acc; // last tick ignore
            acc.push(tick - nextTick);
            return acc;
        }, []);

        const averageDifference = sum(differencesBetweenEachTick) / theTicks.length;
        // ascending order since we reversed above
        theTicks.reverse();
        /**
         * evenlySpacedTicks
         * - Manually create the x ticks starting with the first tick and
         * adding the difference sequentially.
         */
        const evenlySpacedTicks = (ticks, diff) => {
            const newTicks = cloneDeep(ticks);
            /**
             * Tthe ticks method for d3 does not include ticks for the very beginning
             * and the end of the domain. This leaves a gap between the last tick we create
             * and the last tick of the domain. Therefore we increase our array by two.
             * Since we ignore the first and last tick we cannot unshift or push :(.
             */
            newTicks.splice(1, 0, 1);
            return newTicks.reduce((acc, tick, i) => {
                // ignore first and last tick
                if (i === 0 || i + 1 === newTicks.length) {
                    acc.push(tick);
                }
                else {
                    acc.push(acc[i - 1] + diff);
                }
                return acc;
            }, []);
        };
        /**
         * removeOverlappingTicks
         * - Manually adding ticks could cause overlap since d3 is creating their own ticks.
         * This filters any ticks that might overlap.  The number 20 was derived
         * from visual evidence of overlap on this award ASST_NON_1905OH5MAP_7530.
         * @param {Number[]} - array of milliseconds
         * @param {function} - d3 scale function
         * @returns {Number[]} - array of milliseconds
         */
        let skipNext = false;
        const removeOverlappingTicks = (ticks, scaleFunc) => ticks.filter((tick, i, src) => {
            if (skipNext) {
                skipNext = false;
                return false;
            }
            const currentTick = scaleFunc(tick);
            const nextTick = scaleFunc(src[i + 1]);
            if (nextTick) {
                const difference = nextTick - currentTick;
                if (difference <= 20) { // ticks overlap
                    // keeps last tick
                    if (i + 2 === src.length) {
                        return false;
                    }
                    skipNext = true;
                }
                return true;
            }
            return true;
        });
        theTicks = evenlySpacedTicks(theTicks, averageDifference);
        theTicks = removeOverlappingTicks(theTicks, scale);
        setXTicks(xTickDateAndLabel(theTicks));
        setXScale(() => scale);
        setXAxisSpacing(spacing);
        return null;
    }, [
        xDomain,
        visualizationWidth,
        padding.left
    ]);
    /**
     * createYScale
     * - creates the y scaling function and ticks.
     * @returns {null}
     */
    const createYScaleAndTicks = useCallback(() => {
        const scale = scaleLinear().domain(yDomain).range([0, height]).nice();
        // determine the ticks from D3
        const ticks = scale.ticks(6);
        // add last tick for spacing
        const updatedTicksWithSpacing = addTicksForSpacing(ticks);
        // create new scale since we have new data
        const updatedScale = scaleLinear()
            .domain([yDomain[0], updatedTicksWithSpacing[updatedTicksWithSpacing.length - 1]])
            .range([0, height])
            .nice();
        setYTicks(updatedTicksWithSpacing);
        setYScale(() => updatedScale);
    }, [yDomain, height]);
    // hook - runs only on mount unless transactions change
    useEffect(() => {
        if (xDomain.length && yDomain.length) {
            createXScaleAndTicks(xDomain);
            createYScaleAndTicks(yDomain);
        }
    }, [
        transactions,
        createXScaleAndTicks,
        createYScaleAndTicks,
        xDomain,
        yDomain,
        visualizationWidth
    ]);
    // sets the line values - hook - runs on mount and dates change
    useEffect(() => {
        setStartLineValue(lineHelper(dates._startDate));
        setEndLineValue(lineHelper(dates._endDate));
        setPotentialEndLineValue(lineHelper(dates._potentialEndDate));
    }, [dates]);
    // sets circle data - hook - on mount and when transactions change
    useEffect(() => {
        if (xScale && yScale) {
            const circles = transactions
                .map((data, i) => ({
                    key: `${data.federal_action_obligation}${i}`,
                    description: `A circle representing the transaction date, ${data.action_date.format('MM-DD-YYYY')} and running total obligation of ${formatMoney(data.running_obligation_total)}`,
                    className: 'transaction-date-circle',
                    cx: xScale(data.action_date.valueOf()) + padding.left,
                    cy: (height - yScale(data.running_obligation_total)),
                    r: 1.5
                }));
            setCircleData(circles);
        }
    }, [
        transactions,
        padding,
        xScale,
        yScale,
        xAxisSpacing,
        height
    ]);
    // area path - hook
    useEffect(() => {
        if (xScale && yScale) {
            setAreaPath(
                createSteppedAreaPath(
                    transactions,
                    xScale,
                    yScale,
                    height,
                    padding.left,
                    'action_date',
                    'running_obligation_total'
                )
            );
        }
    }, [
        xScale,
        yScale,
        transactions,
        height,
        padding
    ]);
    // should we extend area path to today line
    const shouldWeExtendAreaPathToTodayLine = useCallback(() => {
        const lastTransaction = transactions[transactions.length - 1];
        const todayLineIsBeforeAllEndDates = [endLineValue, potentialEndLineValue]
            .filter((line) => line).every((line) => moment(todayLineValue).isBefore(moment(line)));
        const everyLineIsAfterLastTransaction = filteredAndSortedLinesFirstToLast(
            [todayLineValue, endLineValue, potentialEndLineValue]).every((line) => (
            lastTransaction.action_date.isBefore(moment(line))
        ));
        if (todayLineIsBeforeAllEndDates && everyLineIsAfterLastTransaction) return true;
        return false;
    }, [
        transactions,
        endLineValue,
        potentialEndLineValue
    ]);
    // extend area path to today
    const extendAreaPathToTodayLine = useCallback(() => {
        const lastTransaction = transactions[transactions.length - 1];
        if (shouldWeExtendAreaPathToTodayLine() && xScale && yScale) {
            setAreaPathExtensionToToday(createSteppedAreaPath(
                [
                    ...transactions,
                    {
                        action_date: dateMatchingFirstLineValue([todayLineValue, endLineValue, potentialEndLineValue], dates, todayLineValue, endLineValue),
                        running_obligation_total: lastTransaction.running_obligation_total
                    }
                ],
                xScale,
                yScale,
                height,
                padding.left,
                'action_date',
                'running_obligation_total'
            ));
            setAreaPath(null);
        }
    }, [
        transactions,
        xScale,
        yScale,
        height,
        padding,
        shouldWeExtendAreaPathToTodayLine,
        endLineValue,
        potentialEndLineValue,
        dates
    ]);
    // extend area path to today hook
    useEffect(() => {
        extendAreaPathToTodayLine();
    }, [extendAreaPathToTodayLine]);
    // extend aria path past end line hook
    useEffect(() => {
        if (!areaPathExtensionToTodayLine && xScale && yScale) {
            const firstEndLine = filteredAndSortedLinesFirstToLast([endLineValue, potentialEndLineValue])[0];
            // find index of first transaction after the first end line
            const firstTransactionAfterFirstEndLineIndex = transactions.findIndex((t) => {
                if (t.action_date.isAfter(moment(firstEndLine))) return true;
                return false;
            });
            if (firstTransactionAfterFirstEndLineIndex !== -1) {
                // isolate all transaction before the first end line
                const transactionsBeforeFirstEndLine = transactions.slice(0, firstTransactionAfterFirstEndLineIndex);
                // isolate all transactions after the first end line
                const transactionsAfterFirstEndLine = transactions.slice(firstTransactionAfterFirstEndLineIndex, transactions.length);
                const firstEndLineDate = dateMatchingFirstLineValue([endLineValue, potentialEndLineValue], dates, todayLineValue, endLineValue);
                // create a new area path to the first endline
                if (transactionsBeforeFirstEndLine.length) {
                    setAreaPath(
                        createSteppedAreaPath(
                            [
                                ...transactionsBeforeFirstEndLine,
                                {
                                    action_date: firstEndLineDate,
                                    running_obligation_total: transactionsBeforeFirstEndLine[transactionsBeforeFirstEndLine.length - 1].running_obligation_total
                                }
                            ],
                            xScale,
                            yScale,
                            height,
                            padding.left,
                            'action_date',
                            'running_obligation_total'
                        )
                    );
                }
                // create a new area path after the first endline
                if (transactionsAfterFirstEndLine.length) {
                    const startingYValueForGreyShading = transactionsBeforeFirstEndLine.length ?
                        transactionsBeforeFirstEndLine[transactionsBeforeFirstEndLine.length - 1].running_obligation_total :
                        transactionsAfterFirstEndLine[0].running_obligation_total;
                    setAreaPathPastEndLine(createSteppedAreaPath(
                        [
                            {
                                action_date: firstEndLineDate,
                                running_obligation_total: startingYValueForGreyShading
                            },
                            ...transactionsAfterFirstEndLine
                        ],
                        xScale,
                        yScale,
                        height - 0.5,
                        padding.left,
                        'action_date',
                        'running_obligation_total'
                    ));
                }
            }
        }
    }, [
        endLineValue,
        potentialEndLineValue,
        dates,
        xScale,
        yScale,
        height,
        padding,
        transactions,
        areaPathExtensionToTodayLine
    ]);
    // extend area path when last data point y value changes
    useEffect(() => {
        if (shouldExtendAreaPathWhenLastDataPointYValueChange(transactions, areaPathExtensionToTodayLine) && xScale && yScale) {
            const lastTransaction = transactions[transactions.length - 1];
            const className = areaPathPastEndLine ? 'area-path__past-end-line' : 'area-path';
            const colorForDescription = className === 'area-path' ? 'light blue' : 'grey';
            const description = `An area path of color ${colorForDescription} representing an
            extension of 0.5 pixels to the area path when the y value of the last transaction is greater than
            the second to last transaction`;

            const xAdjustment = xScale.invert(xAxisSpacing + 1) - (xDomain[0]);
            const heightAdjustment = areaPathPastEndLine ? height - 0.5 : height;

            setAreaPathExtensionLastDataPointYValueChange(
                {
                    path: createSteppedAreaPath(
                        [
                            {
                                x: lastTransaction.action_date,
                                y: lastTransaction.running_obligation_total
                            },
                            {
                                x: moment(lastTransaction.action_date.valueOf() + xAdjustment),
                                y: lastTransaction.running_obligation_total
                            }
                        ],
                        xScale,
                        yScale,
                        heightAdjustment,
                        padding.left,
                        'x',
                        'y'
                    ),
                    className,
                    description
                }
            );
        }
        else {
            setAreaPathExtensionLastDataPointYValueChange({ path: null, className: '', description: '' });
        }
    }, [
        xScale,
        yScale,
        height,
        padding,
        areaPathPastEndLine,
        transactions,
        xDomain,
        xAxisSpacing,
        areaPathExtensionToTodayLine
    ]);
    // Adds padding bottom and 40 extra pixels for the x-axis
    const svgHeight = height + padding.bottom + 40;
    // updates the x position of our labels
    const paddingForYAxis = Object.assign(padding, { labels: 20 });
    // text for end line
    const endLineText = awardType === 'grant' ? 'End' : ['Current', 'End'];
    // class name for end line and text
    const endLineClassName = awardType === 'grant' ? 'grant-end' : 'contract-end';

    return (
        <svg
            className="contract-grant-activity-chart"
            width={visualizationWidth}
            height={svgHeight}>
            <g className="contract-grant-activity-chart__body" transform="translate(0,10)">
                <ActivityYAxis
                    height={height}
                    width={visualizationWidth}
                    padding={paddingForYAxis}
                    scale={yScale}
                    ticks={yTicks}
                    textAnchor="left" />
                <ActivityXAxis
                    height={height}
                    width={visualizationWidth - padding.left}
                    padding={padding}
                    ticks={xTicks}
                    scale={xScale}
                    line />
                {/* area path */}
                {areaPath &&
                    <g tabIndex="0">
                        <desc>{transactionPathDescription}</desc>
                        <path
                            className="area-path"
                            d={areaPath} />
                    </g>}
                {/* extend area path to today */}
                {areaPathExtensionToTodayLine &&
                    <g tabIndex="0">
                        <desc>{areaPathToTodayLineDescription}</desc>
                        <path
                            className="area-path"
                            d={areaPathExtensionToTodayLine} />
                    </g>}
                {/* extend area path past end line */}
                {areaPathPastEndLine &&
                    <g tabIndex="0">
                        <desc>{areaPathPastEndLineDescription}</desc>
                        <path
                            className="area-path__past-end-line"
                            d={areaPathPastEndLine} />
                    </g>}
                {/* area Path Extension Last Data Point Y Value Change */}
                {areaPathExtensionLastDataPointYValueChange.path &&
                    <g tabIndex="0">
                        <desc>{areaPathExtensionLastDataPointYValueChange.description}</desc>
                        <path
                            className={areaPathExtensionLastDataPointYValueChange.className}
                            d={areaPathExtensionLastDataPointYValueChange.path} />
                    </g>}
                {/* circles */}
                {circleData.length && circleData.map((circle) => {
                    const {
                        key,
                        description,
                        className,
                        cx,
                        cy,
                        r
                    } = circle;
                    return (
                        <g key={key} tabIndex="0">
                            <desc>{description}</desc>
                            <circle
                                className={className}
                                cx={cx}
                                cy={cy}
                                r={r} />
                        </g>
                    );
                })}
                {/* start line */}
                {xScale && <VerticalLine
                    xScale={xScale}
                    y1={-10}
                    y2={height}
                    textY={0}
                    text="Start"
                    xMax={xDomain[1]}
                    xMin={xDomain[0]}
                    xValue={startLineValue}
                    showTextPosition="right"
                    adjustmentX={padding.left}
                    textClassname="vertical-line__text start"
                    lineClassname="vertical-line start" />}
                {/* today line */}
                {xScale && <VerticalLine
                    xScale={xScale}
                    y1={-10}
                    y2={height}
                    textY={0}
                    text="Today"
                    xMax={xDomain[1]}
                    xMin={xDomain[0]}
                    xValue={todayLineValue}
                    showTextPosition="left"
                    adjustmentX={padding.left}
                    textClassname="vertical-line__text today"
                    lineClassname="vertical-line today" />}
                {/* end line */}
                {xScale && <VerticalLine
                    xScale={xScale}
                    y1={-10}
                    y2={height}
                    textY={0}
                    text={endLineText}
                    xMax={xDomain[1]}
                    xMin={xDomain[0]}
                    xValue={endLineValue}
                    showTextPosition="left"
                    adjustmentX={padding.left}
                    textClassname={`vertical-line__text ${endLineClassName}`}
                    lineClassname={`vertical-line ${endLineClassName}`} />}
                {/* potential end line */}
                {xScale && <VerticalLine
                    xScale={xScale}
                    y1={-10}
                    y2={height}
                    textY={0}
                    text={['Potential', 'End']}
                    xMax={xDomain[1]}
                    xMin={xDomain[0]}
                    xValue={potentialEndLineValue}
                    showTextPosition="left"
                    adjustmentX={padding.left}
                    textClassname="vertical-line__text potential-end"
                    lineClassname="vertical-line potential-end" />}
            </g>
        </svg>
    );
};

ContractGrantsActivityChart.propTypes = propTypes;

export default ContractGrantsActivityChart;
