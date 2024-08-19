// tree_parse.h
#ifndef TREE_PARSE_H
#define TREE_PARSE_H

#include <vector>
#include <unordered_map>

struct TreeNode {
    std::string name;
    uint64_t value;
    uint64_t left_sum;
    bool cold;
    std::vector<TreeNode> children;
};

uint64_t calculate_left_sum(TreeNode& node, uint64_t& running_sum);

TreeNode prune_tree(const TreeNode& node, uint64_t threshold_left, uint64_t threshold_right);


#endif // TREE_PARSE_H
