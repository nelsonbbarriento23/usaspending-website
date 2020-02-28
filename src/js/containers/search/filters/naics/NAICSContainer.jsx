/**
  * NAICSSearchContainer.jsx => NAICSContainer.jsx
  * Created by Emily Gullo 07/10/2017
  **/

import React from 'react';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import {
    debounce,
    isEqual
} from 'lodash';
import { isCancel } from 'axios';
import CheckboxTree from 'containers/shared/checkboxTree/CheckboxTree';
import { naicsRequest } from 'helpers/naicsHelper';
import { expandAllNodes } from 'helpers/checkboxTreeHelper';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

import { updateNaics } from 'redux/actions/search/searchFilterActions';
import { setNaics, setExpanded, setChecked, setSearchedNaics, addChecked } from 'redux/actions/search/naicsActions';
import { EntityDropdownAutocomplete } from 'components/search/filters/location/EntityDropdownAutocomplete';
import SelectedNaic from 'components/search/filters/naics/SelectNaic';

const propTypes = {
    updateNaics: PropTypes.func,
    setNaics: PropTypes.func,
    setExpanded: PropTypes.func,
    setChecked: PropTypes.func,
    removeNAICS: PropTypes.func,
    setSearchedNaics: PropTypes.func,
    addChecked: PropTypes.func,
    expanded: PropTypes.arrayOf(PropTypes.string),
    checked: PropTypes.arrayOf(PropTypes.string),
    nodes: PropTypes.arrayOf(PropTypes.object),
    searchedNodes: PropTypes.arrayOf(PropTypes.object),
    searchExpanded: PropTypes.arrayOf(PropTypes.string)
};

export class NAICSContainer extends React.Component {
    constructor(props) {
        super(props);
        this.state = {
            isError: false,
            errorMessage: '',
            isLoading: false,
            isSearch: false,
            searchString: '',
            requestType: 'initial'
        };
        this.request = null;
    }

    componentDidMount() {
        // show staged filters
        this.selectNaicsData();
        return this.fetchNAICS();
    }

    componentDidUpdate(prevProps) {
        if (!isEqual(this.props.checked, prevProps.checked)) {
            this.selectNaicsData();
        }
    }

    onSearchChange = debounce(() => {
        if (!this.state.searchString) return this.onClear();
        return this.setState({ requestType: 'search' }, this.fetchNAICS);
    }, 500);

    onClear = () => {
        if (this.request) this.request.cancel();
        this.setState({
            isSearch: false,
            searchString: '',
            isLoading: false,
            requestType: ''
        });
    }

    onExpand = (value, expanded, fetch) => {
        if (fetch && !this.state.isSearch) this.fetchNAICS(value);
        if (this.state.isSearch) {
            this.props.setExpanded(expanded, 'SET_SEARCHED_EXPANDED');
        }
        else {
            this.props.setExpanded(expanded);
        }
    };

    onCollapse = (expanded) => {
        if (this.state.isSearch) {
            this.props.setExpanded(expanded, 'SET_SEARCHED_EXPANDED');
        }
        else {
            this.props.setExpanded(expanded);
        }
    };
    /**
     * onCheck
     * - updates redux checked and updates naics search filters in redux
     * @param {string[]} checked - and array of checked values
     * @returns {null}
     */
    onCheck = async (checkedNodes, node) => {
        // sets checked in naics redux
        await this.props.setChecked(checkedNodes);
        // sets staged filters in search redux
        await this.props.updateNaics(checkedNodes);
    }

    getParentNode = (param) => {
        if (param.length === 2) {
            return this.props.nodes.find((node) => node.value === param);
        }
        if (param.length === 4) {
            return this.props.nodes
                .find((node) => node.value === `${param[0]}${param[1]}`).children
                .find(((node) => node.value === param));
        }
        return '';
    }

    handleTextInputChange = (e) => {
        const text = e.target.value;
        if (!text) {
            return this.onClear();
        }
        return this.setState({ searchString: text, isSearch: true }, this.onSearchChange);
    };

    /**
     * TODO #1: Persisting Checked between toggling between views
     *  - When we go to the search view and check, we put the real node in the checked array
     *  - The expand/collapse view has a search placeholder for this node.
     *  - Therefore, it does not show as checked.
     *  - It will only show as checked if we have the "children_of" version of the checked array
     * TODO #2: Determining a Full vs a Half Check when toggling between views:
     *  - Once we can persist the checks from TODO #1, we need to show the appropriate version of a check -
     *    either half or full.
     *  - To do this, we should be able to look at the immediate parent nodes count number the immediate
     *    sum of all similar account number.
     * 
     * This fn should help with both. We probably need a few more that do the same thing.
     */ 
    areNodeChildrenMocked = (nodeKey) => {
        if (nodeKey.length === 2) {
            return this.props.nodes
                .find((node) => node.value === nodeKey)
                .children
                .some((child) => Object.keys(child).includes('isPlaceHolder'));
        }
        else if (nodeKey.length === 4) {
            return this.props.nodes
                .find((node) => node.value === nodeKey[0] + nodeKey[1])
                .children
                .find((node) => node.value === nodeKey)
                .children
                .some((child) => Object.keys(child).includes('isPlaceHolder'));
        }
        else if (nodeKey.length === 6) {
            return this.props.nodes
                .find((node) => node.value === nodeKey[0] + nodeKey[1])
                .children
                .find((node) => node.value === nodeKey[0] + nodeKey[1] + nodeKey[2] + nodeKey[3])
                .children
                .some((child) => Object.keys(child).includes('isPlaceHolder'));
        }
        return true;
    };

    autoCheckChildrenOfParent = (parentNode) => {
        const value = parentNode.naics;
        // deselect placeholder values!
        const noPlaceHolderCheckedValues = this.props.checked
            .filter((checked) => !checked.includes(`children_of_${value}`));

        const newValues = parentNode
            .children
            .map((child) => {
                if (value.length === 2) return `children_of_${child.naics}`;
                return child.naics;
            });

        this.props.setChecked([...new Set([...noPlaceHolderCheckedValues, ...newValues])]);
    }

    fetchNAICS = async (param = '') => {
        if (this.request) this.request.cancel();
        const { requestType, isSearch, searchString } = this.state;
        const { checked } = this.props;
        const searchParam = (isSearch && searchString)
            ? `?filter=${searchString}`
            : null;
        if (requestType === 'initial' || requestType === 'search') {
            this.setState({ isLoading: true });
        }

        this.request = naicsRequest(param || searchParam);

        try {
            const { data } = await this.request.promise;

            if (isSearch) {
                this.props.setSearchedNaics(data.results);
                const expanded = expandAllNodes(this.props.searchedNodes);
                this.props.setExpanded(expanded, 'SET_SEARCHED_EXPANDED');
            }
            else {
                this.props.setNaics(param, data.results);
            }
            // we've searched for a specific naics reference; ie '11' or '1111'
            if (checked.includes(`children_of_${param}`)) {
                this.autoCheckChildrenOfParent(data.results[0], param);
            }

            this.setState({
                isLoading: false,
                isError: false,
                errorMessage: '',
                requestType: ''
            });
        }
        catch (e) {
            console.log(' Error NAICS Reponse : ', e);
            if (!isCancel(e)) {
                this.setState({
                    isError: true,
                    errorMessage: e.message,
                    isLoading: false,
                    requestType: ''
                });
            }
        }
        this.request = null;
    };

    loadingDiv = () => {
        if (!this.state.isLoading) return null;
        return (
            <div className="naics-filter-message-container">
                <FontAwesomeIcon icon="spinner" spin />
                <div className="naics-filter-message-container__text">Loading your data...</div>
            </div>
        );
    }

    errorDiv = () => {
        const { isError, errorMessage } = this.state;
        if (!isError) return null;
        return (
            <div className="naics-filter-message-container">
                <div className="naics-filter-message-container__text">
                    {errorMessage}
                </div>
            </div>
        );
    }

    noResultsDiv = () => {
        const { isError, isLoading } = this.state;
        if (isError || isLoading || this.props.nodes.length > 0) return null;
        return (
            <div className="naics-filter-message-container">
                <FontAwesomeIcon icon="ban" />
                <div className="naics-filter-message-container__text">
                    No Results
                </div>
            </div>
        );
    }

    checkboxDiv() {
        const {
            isLoading,
            isError,
            searchString,
            isSearch
        } = this.state;
        const { checked, nodes, expanded, searchedNodes, searchExpanded } = this.props;
        if (isLoading || isError) return null;
        return (
            <CheckboxTree
                limit={3}
                data={isSearch ? searchedNodes : nodes}
                expanded={isSearch ? searchExpanded : expanded}
                checked={checked}
                searchText={searchString}
                onExpand={this.onExpand}
                onCollapse={this.onCollapse}
                onCheck={this.onCheck} />
        );
    }

    selectNaicsData = () => {
        const { nodes, checked } = this.props;
        const selectedNaicsData = checked
            .reduce((acc, value) => {
                const key = value.includes('children_of_')
                    ? value.split('children_of_')[1]
                    : value;
                 
                const parentKey = `${key[0]}${key[1]}`;
                const parentNode = nodes.find((node) => node.value === parentKey);
                const indexOfParent = acc.findIndex((node) => node.value === parentKey);
                const isParentSelected = indexOfParent >= 0;

                if (!isParentSelected && key.length === 2) {
                    acc.push(parentNode);
                    return acc;
                }
                else if (!isParentSelected && key.length === 4) {
                    acc.push({
                        ...parentNode,
                        count: parentNode.children.find((node) => node.value === key).count
                    });
                    return acc;
                }
                else if (!isParentSelected && key.length === 6) {
                    acc.push({
                        ...parentNode,
                        count: 1
                    });
                    return acc;
                }
                if (isParentSelected && key.length === 4) {
                    acc[indexOfParent].count += parentNode.children.find((node) => node.value === key).count;
                    return acc;
                }
                if (isParentSelected && key.length === 6) {
                    acc[indexOfParent].count++;
                    return acc;
                }
                return acc;
            }, []);
        // an array of objects representing naics tier one objects: { value, label, count }. Only show top level parents
        return selectedNaicsData;
    }

    selectedNaics = () => {
        if (!this.props.checked.size === 0) return null;
        const selectedNaicsData = this.selectNaicsData();
        return (<SelectedNaic
            selectedNAICS={selectedNaicsData}
            removeNAICS={this.props.removeNAICS} />);
    }

    render() {
        const loadingDiv = this.loadingDiv();
        const noResultsDiv = this.noResultsDiv();
        const errorDiv = this.errorDiv();
        const { searchString } = this.state;
        return (
            <div>
                <div className="naics-search-container">
                    <EntityDropdownAutocomplete
                        placeholder="Type to find codes"
                        searchString={searchString}
                        enabled
                        openDropdown={this.onSearchClick}
                        toggleDropdown={this.toggleDropdown}
                        handleTextInputChange={this.handleTextInputChange}
                        context={{}}
                        loading={false}
                        handleOnKeyDown={this.handleOnKeyDown}
                        isClearable
                        onClear={this.onClear} />
                    {loadingDiv}
                    {noResultsDiv}
                    {errorDiv}
                    {this.checkboxDiv()}
                    {this.selectedNaics()}
                </div>
            </div>
        );
    }
}

NAICSContainer.propTypes = propTypes;

export default connect(
    (state) => ({
        nodes: state.naics.naics.toJS(),
        expanded: state.naics.expanded.toJS(),
        searchExpanded: state.naics.searchExpanded.toJS(),
        checked: state.naics.checked.toJS(),
        searchedNodes: state.naics.searchedNaics.toJS()
    }),
    (dispatch) => ({
        updateNaics: (checked) => dispatch(updateNaics(checked)),
        setNaics: (key, naics) => dispatch(setNaics(key, naics)),
        setExpanded: (expanded, type) => dispatch(setExpanded(expanded, type)),
        setChecked: (checkedNodes) => dispatch(setChecked(checkedNodes)),
        addChecked: (newCheckedNode) => dispatch(addChecked(newCheckedNode)),
        setSearchedNaics: (nodes) => dispatch(setSearchedNaics(nodes))
    }))(NAICSContainer);
