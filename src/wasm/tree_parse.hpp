// tree_parse.h
#ifndef TREE_PARSE_H
#define TREE_PARSE_H

#include <iostream>
#include <fstream>
#include <nlohmann/json.hpp>
#include <vector>
#include <unordered_map>

using json = nlohmann::json;


struct TreeNode {
    std::string name;
    uint64_t value;
    uint64_t left_sum;
    bool cold;
    std::vector<TreeNode> children;
};

TreeNode parse_json_to_tree(const json& j_node);

uint64_t calculate_left_sum(TreeNode& node, uint64_t& running_sum);

TreeNode prune_tree(const TreeNode& node, uint64_t threshold_left, uint64_t threshold_right);

json tree_to_json(const TreeNode& node);

void save_json_to_file(const json& j, const std::string& filename);

void print_tree(const TreeNode& node, int level = 0);

#endif // TREE_PARSE_H
