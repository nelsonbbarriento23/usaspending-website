/**
 * AccountLandingContent.jsx
 * Created by Lizzie Salita 8/4/17
 */

import React from 'react';
import PropTypes from 'prop-types';

import Pagination from 'components/sharedComponents/Pagination';
import AccountLandingSearchBar from './AccountLandingSearchBar';
import AccountLandingResultsSection from './AccountLandingResultsSection';

const propTypes = {
    results: PropTypes.array,
    accountSearchString: PropTypes.string,
    inFlight: PropTypes.bool,
    columns: PropTypes.array,
    setAccountSearchString: PropTypes.func,
    onChangePage: PropTypes.func,
    pageNumber: PropTypes.number,
    totalItems: PropTypes.number,
    pageSize: PropTypes.number
};

export default class AccountLandingContent extends React.Component {
    render() {
        return (
            <div className="landing-page-content">
                <div className="landing-page-overview">
                    <h3>Find a Federal Account Profile.</h3>
                    <h6>Explore spending in greater detail in our federal account profiles.</h6>
                    <p>
                        There are over 2,000 unique federal accounts used to track the spending of
                        federal agencies. These help to understand how agencies receive and spend
                        funding granted by congress to carry out their programs, projects, or activities.
                    </p>
                </div>
                <div className="landing-page-section">
                    <AccountLandingSearchBar
                        setAccountSearchString={this.props.setAccountSearchString} />
                </div>
                <div className="landing-page-section results-count">
                    <Pagination
                        onChangePage={this.props.onChangePage}
                        pageNumber={this.props.pageNumber}
                        totalItems={this.props.totalItems}
                        pageSize={this.props.pageSize} />
                </div>
                <div className="landing-page-section">
                    <AccountLandingResultsSection
                        columns={this.props.columns}
                        results={this.props.results}
                        inFlight={this.props.inFlight}
                        accountSearchString={this.props.accountSearchString} />
                    <Pagination
                        onChangePage={this.props.onChangePage}
                        pageNumber={this.props.pageNumber}
                        totalItems={this.props.totalItems}
                        pageSize={this.props.pageSize} />
                </div>
            </div>
        );
    }
}

AccountLandingContent.propTypes = propTypes;
