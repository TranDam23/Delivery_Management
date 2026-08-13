// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title DeliveryTracking
/// @notice Ghi nhan bat bien cac moc quan trong (tao don, lay hang, nhap kho,
///         dang giao, giao thanh cong, hoan hang, huy don...) cua mot don giao
///         hang len blockchain. Du lieu chi tiet don hang van luu o Supabase;
///         hop dong nay chi luu ma bam (hash) va metadata toi thieu de doi
///         chieu/xac minh, phuc vu tra cuu minh bach va xu ly tranh chap.
contract DeliveryTracking is Ownable {
    struct DeliveryEvent {
        string trackingCode; // Ma don hang (tracking_code trong DB)
        string eventType; // vd: ORDER_CREATED, PICKED_UP, IN_WAREHOUSE, IN_TRANSIT, DELIVERED, RETURNED, CANCELLED
        address performedBy; // Vi cua he thong/nhan vien thuc hien thao tac
        bytes32 eventDataHash; // keccak256 cua du lieu chi tiet (chong sua doi)
        uint256 timestamp;
    }

    /// @dev Danh sach tuan tu cac su kien theo tracking code, dung lam so cai bat bien.
    mapping(string => DeliveryEvent[]) private _eventsByTrackingCode;

    /// @dev Vi duoc phep ghi su kien len chain (backend service wallet, co the co nhieu).
    mapping(address => bool) public isOperator;

    event OperatorUpdated(address indexed operator, bool allowed);

    event DeliveryEventRecorded(
        string indexed trackingCodeIndexed,
        string trackingCode,
        string eventType,
        address indexed performedBy,
        bytes32 eventDataHash,
        uint256 timestamp,
        uint256 eventIndex
    );

    error NotOperator(address caller);
    error EmptyTrackingCode();

    modifier onlyOperator() {
        if (!isOperator[msg.sender] && msg.sender != owner()) {
            revert NotOperator(msg.sender);
        }
        _;
    }

    constructor(address initialOwner) Ownable(initialOwner) {
        isOperator[initialOwner] = true;
        emit OperatorUpdated(initialOwner, true);
    }

    /// @notice Cap/thu quyen ghi su kien cho mot dia chi vi (vd: vi backend service).
    function setOperator(address operator, bool allowed) external onlyOwner {
        isOperator[operator] = allowed;
        emit OperatorUpdated(operator, allowed);
    }

    /// @notice Ghi nhan mot moc su kien giao nhan cho don hang len blockchain.
    /// @param trackingCode Ma don hang.
    /// @param eventType Loai su kien (ORDER_CREATED, PICKED_UP, DELIVERED, ...).
    /// @param performedBy Dia chi vi dai dien nguoi/thiet bi thuc hien (co the la vi cua nhan vien giao hang).
    /// @param eventDataHash keccak256 cua payload chi tiet (order_id, status, note, image_url, ...) luu o DB.
    function recordEvent(
        string calldata trackingCode,
        string calldata eventType,
        address performedBy,
        bytes32 eventDataHash
    ) external onlyOperator returns (uint256 eventIndex) {
        if (bytes(trackingCode).length == 0) revert EmptyTrackingCode();

        DeliveryEvent memory newEvent = DeliveryEvent({
            trackingCode: trackingCode,
            eventType: eventType,
            performedBy: performedBy,
            eventDataHash: eventDataHash,
            timestamp: block.timestamp
        });

        _eventsByTrackingCode[trackingCode].push(newEvent);
        eventIndex = _eventsByTrackingCode[trackingCode].length - 1;

        emit DeliveryEventRecorded(
            trackingCode,
            trackingCode,
            eventType,
            performedBy,
            eventDataHash,
            block.timestamp,
            eventIndex
        );
    }

    /// @notice Lay toan bo hanh trinh (lich su su kien) cua mot don hang.
    function getEvents(string calldata trackingCode) external view returns (DeliveryEvent[] memory) {
        return _eventsByTrackingCode[trackingCode];
    }

    /// @notice So luong su kien da ghi nhan cho mot don hang.
    function getEventCount(string calldata trackingCode) external view returns (uint256) {
        return _eventsByTrackingCode[trackingCode].length;
    }

    /// @notice Lay su kien gan nhat (trang thai hien tai) cua mot don hang.
    function getLatestEvent(string calldata trackingCode) external view returns (DeliveryEvent memory) {
        uint256 length = _eventsByTrackingCode[trackingCode].length;
        require(length > 0, "No events for trackingCode");
        return _eventsByTrackingCode[trackingCode][length - 1];
    }
}
